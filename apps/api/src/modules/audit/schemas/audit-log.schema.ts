import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

/**
 * Security / administration record. Distinct from the user-facing activity feed:
 * this captures who did what to which entity, with before/after and request
 * metadata, and is only readable with `audit.read`.
 */
@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'audit_logs' })
export class AuditLog {
  /** null for platform-wide admin actions with no single workspace in scope (e.g.
   *  banning a user account) — everything workspace-scoped still sets this as before. */
  @Prop({ type: Types.ObjectId, ref: 'Workspace', default: null, index: true })
  workspaceId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  actorUserId!: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  actorLabel!: string | null;

  @Prop({ required: true })
  action!: string;

  @Prop({ required: true })
  entityType!: string;

  @Prop({ type: String, default: null })
  entityId!: string | null;

  @Prop({ type: Object, default: null })
  before!: Record<string, unknown> | null;

  @Prop({ type: Object, default: null })
  after!: Record<string, unknown> | null;

  @Prop({ type: String, default: null })
  ip!: string | null;

  @Prop({ type: String, default: null })
  userAgent!: string | null;

  createdAt!: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ workspaceId: 1, createdAt: -1 });
AuditLogSchema.index({ workspaceId: 1, entityType: 1, entityId: 1 });
