import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { nanoid } from 'nanoid';
import type { AuthTokens, LoginResult, SessionView } from '@flowdesk/types';
import type { AppConfig } from '../../config/configuration.js';
import { ApiException } from '../../common/http/api-exception.js';
import { randomToken, safeEqualHex, sha256 } from '../../common/crypto/tokens.js';
import { MailService } from '../../infra/mail/mail.service.js';
import { MembershipsService } from '../memberships/memberships.service.js';
import { UsersService } from '../users/users.service.js';
import { RefreshSession, type RefreshSessionDocument } from './schemas/refresh-session.schema.js';
import { VerificationToken, type VerificationTokenDocument } from './schemas/verification-token.schema.js';

export interface RequestMeta {
  userAgent: string | null;
  ip: string | null;
}

export interface IssuedSession {
  tokens: AuthTokens;
  /** raw value to place in the HttpOnly refresh cookie: `<family>.<secret>` */
  refreshCookie: string;
  refreshMaxAgeMs: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');

  constructor(
    private readonly users: UsersService,
    private readonly memberships: MembershipsService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly config: ConfigService<AppConfig, true>,
    @InjectModel(RefreshSession.name) private readonly sessions: Model<RefreshSessionDocument>,
    @InjectModel(VerificationToken.name) private readonly vtokens: Model<VerificationTokenDocument>,
  ) {}

  // ── Registration & email verification ──────────────────────────────────────

  async register(input: { name: string; email: string; password: string; locale?: 'en' | 'ar' }): Promise<void> {
    const user = await this.users.createLocal(input);
    await this.issueVerificationEmail(user.id, user.name, user.email);
  }

  async resendVerification(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    // Do not reveal whether the address exists.
    if (!user || user.emailVerified) return;
    await this.issueVerificationEmail(user.id, user.name, user.email);
  }

  private async issueVerificationEmail(userId: string, name: string, email: string): Promise<void> {
    const raw = randomToken(32);
    await this.vtokens.create({
      user: new Types.ObjectId(userId),
      purpose: 'email_verify',
      tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    const verifyUrl = `${this.webOrigin()}/verify-email?token=${raw}`;
    await this.mail.send({ template: 'verify_email', to: email, data: { name, verifyUrl } });
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const token = await this.consumeToken(rawToken, 'email_verify');
    await this.users.markEmailVerified(token.user);
  }

  // ── Login / refresh / logout ──────────────────────────────────────────────

  async login(email: string, password: string, meta: RequestMeta): Promise<LoginResult & { session: IssuedSession }> {
    const user = await this.users.findByEmail(email, true);
    const ok = user ? await this.users.verifyPassword(user.passwordHash, password) : false;
    if (!user || !ok) throw ApiException.unauthorized('Invalid email or password.');
    if (user.isSuspended) throw ApiException.forbidden('This account has been suspended.');

    const session = await this.startSession(user.id, user.email, user.tokenEpoch, meta);
    await this.users.recordLogin(user.id);

    return {
      user: this.users.toAuthUser(user),
      tokens: session.tokens,
      memberships: await this.memberships.listForUser(user.id),
      session,
    };
  }

  /** Rotate a refresh token. Detects reuse of an already-rotated token. */
  async refresh(rawCookie: string | undefined, meta: RequestMeta): Promise<IssuedSession> {
    const parsed = this.parseRefreshCookie(rawCookie);
    if (!parsed) throw ApiException.unauthorized('Missing or malformed session.');
    const { family, secret } = parsed;

    const current = await this.sessions.findOne({ family }).sort({ createdAt: -1 }).exec();
    if (!current) throw ApiException.unauthorized('Session not found.');

    if (current.revokedAt) {
      // A revoked family being presented again → possible theft of an old token.
      await this.revokeFamily(family, 'reuse_detected');
      await this.users.bumpTokenEpoch(current.user);
      this.logger.warn(`Refresh reuse detected for family ${family}; revoked all sessions for user ${String(current.user)}`);
      throw ApiException.unauthorized('Session expired. Please sign in again.');
    }

    if (current.expiresAt.getTime() < Date.now()) {
      await this.revokeFamily(family, 'logout');
      throw ApiException.unauthorized('Session expired. Please sign in again.');
    }

    if (!safeEqualHex(current.tokenHash, sha256(secret))) {
      await this.revokeFamily(family, 'reuse_detected');
      await this.users.bumpTokenEpoch(current.user);
      this.logger.warn(`Refresh hash mismatch for family ${family}; revoked family`);
      throw ApiException.unauthorized('Session expired. Please sign in again.');
    }

    const user = await this.users.findById(current.user);
    if (!user || user.isSuspended) throw ApiException.unauthorized('Account is not active.');

    // Rotate: revoke current row, append a fresh one in the same family.
    const newSecret = randomToken(48);
    current.revokedAt = new Date();
    current.revokedReason = 'rotated';
    await current.save();

    const expiresAt = new Date(Date.now() + this.refreshTtlMs());
    await this.sessions.create({
      user: current.user,
      family,
      tokenHash: sha256(newSecret),
      expiresAt,
      lastUsedAt: new Date(),
      userAgent: meta.userAgent,
      ip: meta.ip,
    });

    return this.buildIssued(user.id, user.email, user.tokenEpoch, family, newSecret, expiresAt);
  }

  async logout(rawCookie: string | undefined): Promise<void> {
    const parsed = this.parseRefreshCookie(rawCookie);
    if (parsed) await this.revokeFamily(parsed.family, 'logout');
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessions
      .updateMany({ user: new Types.ObjectId(userId), revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'logout_all' } })
      .exec();
    await this.users.bumpTokenEpoch(userId);
  }

  async listSessions(userId: string, currentFamily: string): Promise<SessionView[]> {
    const rows = await this.sessions
      .find({ user: new Types.ObjectId(userId), revokedAt: null })
      .sort({ lastUsedAt: -1 })
      .exec();
    // Collapse to one entry per family (latest row wins).
    const byFamily = new Map<string, RefreshSessionDocument>();
    for (const row of rows) if (!byFamily.has(row.family)) byFamily.set(row.family, row);
    return [...byFamily.values()].map((row) => ({
      id: row.family,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      userAgent: row.userAgent,
      ip: row.ip,
      current: row.family === currentFamily,
    }));
  }

  async revokeSession(userId: string, family: string): Promise<void> {
    const res = await this.sessions
      .updateMany(
        { user: new Types.ObjectId(userId), family, revokedAt: null },
        { $set: { revokedAt: new Date(), revokedReason: 'logout' } },
      )
      .exec();
    if (res.matchedCount === 0) throw ApiException.notFound('Session');
  }

  // ── Password reset / change ──────────────────────────────────────────────

  async forgotPassword(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) return; // silent
    const raw = randomToken(32);
    await this.vtokens.create({
      user: new Types.ObjectId(user.id),
      purpose: 'password_reset',
      tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const resetUrl = `${this.webOrigin()}/reset-password?token=${raw}`;
    await this.mail.send({ template: 'reset_password', to: user.email, data: { name: user.name, resetUrl } });
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const token = await this.consumeToken(rawToken, 'password_reset');
    await this.users.setPassword(token.user, newPassword); // bumps epoch
    await this.sessions
      .updateMany({ user: token.user, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'password_changed' } })
      .exec();
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.users.findByIdWithSecret(userId);
    if (!user) throw ApiException.notFound('User');
    const ok = await this.users.verifyPassword(user.passwordHash, currentPassword);
    if (!ok) throw ApiException.validation('Current password is incorrect.');
    await this.users.setPassword(userId, newPassword);
    await this.sessions
      .updateMany({ user: new Types.ObjectId(userId), revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'password_changed' } })
      .exec();
  }

  // ── internals ───────────────────────────────────────────────────────────

  private async startSession(
    userId: string,
    email: string,
    epoch: number,
    meta: RequestMeta,
  ): Promise<IssuedSession> {
    const family = nanoid(21);
    const secret = randomToken(48);
    const expiresAt = new Date(Date.now() + this.refreshTtlMs());
    await this.sessions.create({
      user: new Types.ObjectId(userId),
      family,
      tokenHash: sha256(secret),
      expiresAt,
      lastUsedAt: new Date(),
      userAgent: meta.userAgent,
      ip: meta.ip,
    });
    return this.buildIssued(userId, email, epoch, family, secret, expiresAt);
  }

  private async buildIssued(
    userId: string,
    email: string,
    epoch: number,
    family: string,
    secret: string,
    expiresAt: Date,
  ): Promise<IssuedSession> {
    const accessTtl = this.config.get('jwt.accessTtl', { infer: true });
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email, sid: family, epoch, type: 'access' },
      { secret: this.config.get('jwt.accessSecret', { infer: true }), expiresIn: accessTtl },
    );
    return {
      tokens: { accessToken, expiresIn: accessTtl },
      refreshCookie: `${family}.${secret}`,
      refreshMaxAgeMs: expiresAt.getTime() - Date.now(),
    };
  }

  private async revokeFamily(family: string, reason: RefreshSessionDocument['revokedReason']): Promise<void> {
    await this.sessions.updateMany({ family, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } }).exec();
  }

  private async consumeToken(rawToken: string, purpose: VerificationTokenDocument['purpose']): Promise<VerificationTokenDocument> {
    const token = await this.vtokens.findOne({ tokenHash: sha256(rawToken), purpose }).exec();
    if (!token || token.consumedAt || token.expiresAt.getTime() < Date.now()) {
      throw ApiException.validation('This link is invalid or has expired.');
    }
    token.consumedAt = new Date();
    await token.save();
    return token;
  }

  private parseRefreshCookie(raw: string | undefined): { family: string; secret: string } | null {
    if (!raw) return null;
    const idx = raw.indexOf('.');
    if (idx <= 0 || idx === raw.length - 1) return null;
    return { family: raw.slice(0, idx), secret: raw.slice(idx + 1) };
  }

  private refreshTtlMs(): number {
    return this.config.get('jwt.refreshTtl', { infer: true }) * 1000;
  }

  private webOrigin(): string {
    return this.config.get('http.webOrigin', { infer: true })[0] ?? 'http://localhost:5173';
  }
}
