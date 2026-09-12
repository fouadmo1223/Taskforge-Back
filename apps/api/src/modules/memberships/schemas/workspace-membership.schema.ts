import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { MembershipStatus } from '@flowdesk/types';

export type WorkspaceMembershipDocument = HydratedDocument<WorkspaceMembership>;

@Schema({ timestamps: true, collection: 'workspace_memberships' })
export class WorkspaceMembership {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  /** Null until an invited user accepts and is linked to a real account. */
  @Prop({ type: Types.ObjectId, ref: 'User', default: null, index: true })
  userId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Role', required: true })
  roleId!: Types.ObjectId;

  @Prop({ type: String, enum: ['invited', 'active', 'suspended'], default: 'active' })
  status!: MembershipStatus;

  /** Client members are routed to the client portal, never the internal app. */
  @Prop({ default: false })
  isClient!: boolean;

  /** Set when `isClient` — links the portal user to a Client record. */
  @Prop({ type: Types.ObjectId, ref: 'Client', default: null })
  clientId!: Types.ObjectId | null;

  @Prop({ type: String, lowercase: true, trim: true, default: null })
  invitedEmail!: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  invitedByUserId!: Types.ObjectId | null;

  @Prop({ type: String, default: null, index: true })
  inviteTokenHash!: string | null;

  @Prop({ type: Date, default: null })
  inviteExpiresAt!: Date | null;

  @Prop({ type: Date, default: null })
  joinedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const WorkspaceMembershipSchema = SchemaFactory.createForClass(WorkspaceMembership);

WorkspaceMembershipSchema.index({ workspaceId: 1, userId: 1 }, { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } });
WorkspaceMembershipSchema.index({ workspaceId: 1, status: 1 });
WorkspaceMembershipSchema.index({ workspaceId: 1, invitedEmail: 1 });
