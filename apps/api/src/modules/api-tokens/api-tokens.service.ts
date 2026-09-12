import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { isPermission, type Permission } from '@flowdesk/types';
import { randomToken, sha256 } from '../../common/crypto/tokens.js';
import { ApiException } from '../../common/http/api-exception.js';
import { ApiToken, type ApiTokenDocument } from './schemas/api-token.schema.js';

export interface ApiTokenView {
  id: string;
  name: string;
  prefix: string;
  scopes: Permission[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revoked: boolean;
  createdAt: string;
}

export interface ResolvedApiToken {
  tokenId: string;
  workspaceId: string;
  scopes: Set<Permission>;
}

@Injectable()
export class ApiTokensService {
  constructor(@InjectModel(ApiToken.name) private readonly model: Model<ApiTokenDocument>) {}

  list(workspaceId: string): Promise<ApiTokenDocument[]> {
    return this.model.find({ workspaceId: new Types.ObjectId(workspaceId) }).sort({ createdAt: -1 }).exec();
  }

  async create(
    workspaceId: string,
    userId: string,
    allowedScopes: ReadonlySet<Permission> | 'all',
    input: { name: string; scopes: string[]; expiresInDays?: number | null },
  ): Promise<{ token: ApiTokenDocument; raw: string }> {
    const scopes = [...new Set(input.scopes)].filter(isPermission);
    if (allowedScopes !== 'all') {
      const bad = scopes.find((s) => !allowedScopes.has(s));
      if (bad) throw ApiException.forbidden(`You cannot grant a scope you do not hold: ${bad}`);
    }
    const raw = `fdk_${randomToken(30)}`;
    const doc = await this.model.create({
      workspaceId: new Types.ObjectId(workspaceId),
      name: input.name.trim(),
      tokenHash: sha256(raw),
      prefix: raw.slice(0, 11),
      scopes,
      createdByUserId: new Types.ObjectId(userId),
      expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null,
    });
    return { token: doc, raw };
  }

  async revoke(workspaceId: string, id: string): Promise<void> {
    const res = await this.model.updateOne(
      { _id: id, workspaceId: new Types.ObjectId(workspaceId), revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    if (res.matchedCount === 0) throw ApiException.notFound('API token');
  }

  /** Used by {@link ApiTokenGuard}. Returns null for unknown / revoked / expired tokens. */
  async resolve(raw: string): Promise<ResolvedApiToken | null> {
    if (!raw.startsWith('fdk_')) return null;
    const doc = await this.model.findOne({ tokenHash: sha256(raw) }).exec();
    if (!doc || doc.revokedAt) return null;
    if (doc.expiresAt && doc.expiresAt.getTime() < Date.now()) return null;
    // best-effort last-used stamp
    void this.model.updateOne({ _id: doc._id }, { $set: { lastUsedAt: new Date() } }).catch(() => undefined);
    return {
      tokenId: doc.id,
      workspaceId: doc.workspaceId.toString(),
      scopes: new Set(doc.scopes),
    };
  }

  toView(t: ApiTokenDocument): ApiTokenView {
    return {
      id: t.id,
      name: t.name,
      prefix: t.prefix,
      scopes: t.scopes,
      lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
      expiresAt: t.expiresAt?.toISOString() ?? null,
      revoked: t.revokedAt !== null,
      createdAt: t.createdAt.toISOString(),
    };
  }
}
