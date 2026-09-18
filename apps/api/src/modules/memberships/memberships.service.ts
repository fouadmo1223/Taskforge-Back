import { Inject, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { Redis } from 'ioredis';
import type { Permission, WorkspaceMembershipView } from '@flowdesk/types';
import { ApiException } from '../../common/http/api-exception.js';
import type { WorkspaceMembershipContext } from '../../common/context/request-context.js';
import { randomToken, sha256 } from '../../common/crypto/tokens.js';
import { REDIS_CLIENT } from '../../infra/redis/redis.module.js';
import { MailService } from '../../infra/mail/mail.service.js';
import { RolesService } from '../roles/roles.service.js';
import { WorkspaceMembership, type WorkspaceMembershipDocument } from './schemas/workspace-membership.schema.js';

const CTX_TTL_SECONDS = 30;

@Injectable()
export class MembershipsService {
  constructor(
    @InjectModel(WorkspaceMembership.name) private readonly model: Model<WorkspaceMembershipDocument>,
    @InjectConnection() private readonly connection: Connection,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly roles: RolesService,
    private readonly mail: MailService,
  ) {}

  private async workspaceName(workspaceId: string): Promise<string> {
    const doc = await this.connection
      .collection('workspaces')
      .findOne({ _id: new Types.ObjectId(workspaceId) }, { projection: { name: 1 } });
    return (doc?.name as string) ?? 'the workspace';
  }

  // ── workspace bootstrap ──────────────────────────────────────────────────

  async createOwnerMembership(
    workspaceId: Types.ObjectId,
    userId: string,
    ownerRoleId: Types.ObjectId,
    session: ClientSession,
  ): Promise<WorkspaceMembershipDocument> {
    const [doc] = await this.model.create(
      [
        {
          workspaceId,
          userId: new Types.ObjectId(userId),
          roleId: ownerRoleId,
          status: 'active',
          joinedAt: new Date(),
        },
      ],
      { session },
    );
    return doc!;
  }

  // ── request-context resolution (used by WorkspaceGuard) ───────────────────

  async resolveContext(workspaceId: string, userId: string): Promise<WorkspaceMembershipContext | null> {
    if (!Types.ObjectId.isValid(workspaceId)) return null;
    const cacheKey = `ctx:${workspaceId}:${userId}`;
    const cached = await this.redis.get(cacheKey).catch(() => null);
    if (cached) return this.deserializeContext(cached);

    const rows = await this.model.aggregate<{
      _id: Types.ObjectId;
      workspaceId: Types.ObjectId;
      status: string;
      isClient: boolean;
      clientId: Types.ObjectId | null;
      role: { _id: Types.ObjectId; key: string; isOwner: boolean; permissions: Permission[] } | null;
    }>([
      {
        $match: {
          workspaceId: new Types.ObjectId(workspaceId),
          userId: new Types.ObjectId(userId),
        },
      },
      { $lookup: { from: 'roles', localField: 'roleId', foreignField: '_id', as: 'role' } },
      { $unwind: { path: '$role', preserveNullAndEmptyArrays: true } },
      { $limit: 1 },
    ]);

    const row = rows[0];
    if (!row || !row.role || row.status !== 'active') return null;

    const ctx: WorkspaceMembershipContext = {
      membershipId: row._id.toString(),
      workspaceId,
      userId,
      roleId: row.role._id.toString(),
      roleKey: row.role.key,
      permissions: new Set(row.role.isOwner ? [] : row.role.permissions),
      isClient: Boolean(row.isClient),
      clientId: row.clientId ? row.clientId.toString() : null,
      isOwner: Boolean(row.role.isOwner),
    };
    await this.redis.set(cacheKey, this.serializeContext(ctx), 'EX', CTX_TTL_SECONDS).catch(() => undefined);
    return ctx;
  }

  private async invalidateContext(workspaceId: string, userId?: string | null): Promise<void> {
    if (userId) {
      await this.redis.del(`ctx:${workspaceId}:${userId}`).catch(() => undefined);
      return;
    }
    // wildcard clear for the workspace
    const keys = await this.redis.keys(`ctx:${workspaceId}:*`).catch(() => [] as string[]);
    if (keys.length) await this.redis.del(...keys).catch(() => undefined);
  }

  private serializeContext(ctx: WorkspaceMembershipContext): string {
    return JSON.stringify({ ...ctx, permissions: [...ctx.permissions] });
  }

  private deserializeContext(raw: string): WorkspaceMembershipContext {
    const parsed = JSON.parse(raw) as Omit<WorkspaceMembershipContext, 'permissions'> & { permissions: Permission[] };
    return { ...parsed, permissions: new Set(parsed.permissions) };
  }

  // ── queries ─────────────────────────────────────────────────────────────

  async listForUser(userId: string): Promise<WorkspaceMembershipView[]> {
    const rows = await this.model.aggregate<{
      _id: Types.ObjectId;
      status: string;
      isClient: boolean;
      workspace: { _id: Types.ObjectId; name: string; slug: string } | null;
      role: { _id: Types.ObjectId; key: string; name: string; isOwner: boolean; permissions: Permission[] } | null;
    }>([
      { $match: { userId: new Types.ObjectId(userId), status: { $ne: 'invited' } } },
      { $lookup: { from: 'workspaces', localField: 'workspaceId', foreignField: '_id', as: 'workspace' } },
      { $unwind: '$workspace' },
      { $match: { 'workspace.deletedAt': null } },
      { $lookup: { from: 'roles', localField: 'roleId', foreignField: '_id', as: 'role' } },
      { $unwind: '$role' },
      { $sort: { 'workspace.name': 1 } },
    ]);

    return rows
      .filter((r) => r.workspace && r.role)
      .map((r) => ({
        workspaceId: r.workspace!._id.toString(),
        workspaceName: r.workspace!.name,
        workspaceSlug: r.workspace!.slug,
        status: r.status as WorkspaceMembershipView['status'],
        roleId: r.role!._id.toString(),
        roleKey: r.role!.key,
        roleName: r.role!.name,
        permissions: r.role!.isOwner ? [] : r.role!.permissions,
        isClient: Boolean(r.isClient),
      }));
  }

  listMembers(workspaceId: string): Promise<WorkspaceMembershipDocument[]> {
    return this.model
      .find({ workspaceId: new Types.ObjectId(workspaceId) })
      .populate('userId', 'name email avatar')
      .populate('roleId', 'key name')
      .sort({ createdAt: 1 })
      .exec();
  }

  async getMembership(workspaceId: string, membershipId: string): Promise<WorkspaceMembershipDocument> {
    const doc = await this.model
      .findOne({ _id: membershipId, workspaceId: new Types.ObjectId(workspaceId) })
      .exec();
    if (!doc) throw ApiException.notFound('Member');
    return doc;
  }

  // ── mutations ───────────────────────────────────────────────────────────

  async invite(
    workspaceId: string,
    input: { email: string; roleId?: string; isClient?: boolean },
    inviter: { id: string; name: string },
    acceptUrlBase: string,
  ): Promise<WorkspaceMembershipDocument> {
    const email = input.email.toLowerCase().trim();
    const workspaceName = await this.workspaceName(workspaceId);
    const existing = await this.model.findOne({ workspaceId: new Types.ObjectId(workspaceId), invitedEmail: email }).exec();
    if (existing && existing.status !== 'invited') throw ApiException.conflict('That person is already a member.');

    const role = input.roleId
      ? await this.roles.getInWorkspace(workspaceId, input.roleId)
      : await this.roles.getDefaultRole(workspaceId);

    const rawToken = randomToken(24);
    const doc =
      existing ??
      new this.model({
        workspaceId: new Types.ObjectId(workspaceId),
        invitedEmail: email,
      });
    doc.roleId = role._id as Types.ObjectId;
    doc.status = 'invited';
    doc.isClient = Boolean(input.isClient);
    doc.invitedByUserId = new Types.ObjectId(inviter.id);
    doc.inviteTokenHash = sha256(rawToken);
    doc.inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await doc.save();
    await doc.populate('roleId', 'key name');

    await this.mail.send({
      template: 'workspace_invite',
      to: email,
      data: {
        inviterName: inviter.name,
        workspaceName,
        acceptUrl: `${acceptUrlBase}?token=${rawToken}`,
      },
    });
    return doc;
  }

  async acceptInvite(rawToken: string, user: { id: string; email: string }): Promise<{ workspaceId: string }> {
    const doc = await this.model.findOne({ inviteTokenHash: sha256(rawToken), status: 'invited' }).exec();
    if (!doc || !doc.inviteExpiresAt || doc.inviteExpiresAt.getTime() < Date.now()) {
      throw new ApiException('invite_invalid', 'This invitation is invalid or has expired.');
    }
    if (doc.invitedEmail && doc.invitedEmail !== user.email.toLowerCase()) {
      throw new ApiException('invite_email_mismatch', 'This invitation was sent to a different email address.');
    }
    const dupe = await this.model.exists({
      workspaceId: doc.workspaceId,
      userId: new Types.ObjectId(user.id),
      _id: { $ne: doc._id },
    });
    if (dupe) {
      await this.model.deleteOne({ _id: doc._id }).exec();
      throw ApiException.conflict('You are already a member of this workspace.');
    }

    doc.userId = new Types.ObjectId(user.id);
    doc.status = 'active';
    doc.joinedAt = new Date();
    doc.inviteTokenHash = null;
    doc.inviteExpiresAt = null;
    await doc.save();
    await this.invalidateContext(doc.workspaceId.toString(), user.id);
    return { workspaceId: doc.workspaceId.toString() };
  }

  async changeRole(workspaceId: string, membershipId: string, roleId: string): Promise<WorkspaceMembershipDocument> {
    const membership = await this.getMembership(workspaceId, membershipId);
    const currentRole = await this.roles.getInWorkspace(workspaceId, membership.roleId.toString());
    if (currentRole.isOwner) throw ApiException.forbidden('The workspace owner cannot be reassigned here.');
    const role = await this.roles.getInWorkspace(workspaceId, roleId);
    if (role.isOwner) throw ApiException.forbidden('Use ownership transfer to grant the Owner role.');
    membership.roleId = role._id as Types.ObjectId;
    await membership.save();
    await this.invalidateContext(workspaceId, membership.userId?.toString() ?? null);
    return membership;
  }

  async setStatus(
    workspaceId: string,
    membershipId: string,
    status: 'active' | 'suspended',
  ): Promise<WorkspaceMembershipDocument> {
    const membership = await this.getMembership(workspaceId, membershipId);
    const role = await this.roles.getInWorkspace(workspaceId, membership.roleId.toString());
    if (role.isOwner) throw ApiException.forbidden('The workspace owner cannot be suspended.');
    membership.status = status;
    await membership.save();
    await this.invalidateContext(workspaceId, membership.userId?.toString() ?? null);
    return membership;
  }

  async removeMember(workspaceId: string, membershipId: string): Promise<void> {
    const membership = await this.getMembership(workspaceId, membershipId);
    const role = await this.roles.getInWorkspace(workspaceId, membership.roleId.toString());
    if (role.isOwner) throw ApiException.forbidden('The workspace owner cannot be removed.');
    await this.model.deleteOne({ _id: membership._id }).exec();
    await this.invalidateContext(workspaceId, membership.userId?.toString() ?? null);
  }

  countActiveByRole(workspaceId: string, roleId: string): Promise<number> {
    return this.model.countDocuments({
      workspaceId: new Types.ObjectId(workspaceId),
      roleId: new Types.ObjectId(roleId),
      status: 'active',
    });
  }
}
