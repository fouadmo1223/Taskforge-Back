import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLog, type AuditLogDocument } from './schemas/audit-log.schema.js';

export interface AuditEntry {
  /** null for a platform-wide admin action with no single workspace in scope */
  workspaceId: string | null;
  actorUserId?: string | null;
  actorLabel?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger('AuditService');

  constructor(@InjectModel(AuditLog.name) private readonly model: Model<AuditLogDocument>) {}

  /** Fire-and-forget: never let an audit write failure break the request. */
  record(entry: AuditEntry): void {
    this.model
      .create({
        workspaceId: entry.workspaceId ? new Types.ObjectId(entry.workspaceId) : null,
        actorUserId: entry.actorUserId ? new Types.ObjectId(entry.actorUserId) : null,
        actorLabel: entry.actorLabel ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        before: entry.before ?? null,
        after: entry.after ?? null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      })
      .catch((err: unknown) => this.logger.error(`audit write failed: ${String(err)}`));
  }

  async list(
    workspaceId: string,
    opts: { entityType?: string; entityId?: string; limit?: number; before?: Date } = {},
  ): Promise<AuditLogDocument[]> {
    const filter: Record<string, unknown> = { workspaceId: new Types.ObjectId(workspaceId) };
    if (opts.entityType) filter.entityType = opts.entityType;
    if (opts.entityId) filter.entityId = opts.entityId;
    if (opts.before) filter.createdAt = { $lt: opts.before };
    return this.model
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(opts.limit ?? 50, 200))
      .populate('actorUserId', 'name email')
      .exec();
  }

  /** Platform admin view: every entry across every workspace, newest first — used
   *  nowhere in the regular product, only the platform admin dashboard. */
  async listAll(opts: { limit?: number; before?: Date } = {}): Promise<AuditLogDocument[]> {
    const filter: Record<string, unknown> = {};
    if (opts.before) filter.createdAt = { $lt: opts.before };
    return this.model
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(opts.limit ?? 50, 200))
      .populate('actorUserId', 'name email')
      .exec();
  }
}
