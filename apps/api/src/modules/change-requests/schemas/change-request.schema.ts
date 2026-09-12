import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CHANGE_REQUEST_STATUSES, type ChangeRequestStatus } from '@flowdesk/types';

export type ChangeRequestDocument = HydratedDocument<ChangeRequest>;

@Schema({ timestamps: true, collection: 'change_requests' })
export class ChangeRequest {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  projectId!: Types.ObjectId;

  /** sequential per project, e.g. CR-3 */
  @Prop({ required: true })
  number!: number;

  @Prop({ required: true, trim: true, maxlength: 240 })
  title!: string;

  @Prop({ default: '', maxlength: 12000 })
  description!: string;

  @Prop({ default: '', maxlength: 4000 })
  reason!: string;

  @Prop({ type: String, enum: CHANGE_REQUEST_STATUSES, default: 'draft', index: true })
  status!: ChangeRequestStatus;

  @Prop({ default: '', maxlength: 4000 })
  scopeImpact!: string;

  @Prop({ type: Number, default: 0 })
  scheduleImpactDays!: number;

  @Prop({ type: Number, default: 0 })
  costImpact!: number;

  @Prop({ type: Types.ObjectId, ref: 'Approval', default: null })
  approvalId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  requestedByUserId!: Types.ObjectId;

  @Prop({ type: Date, default: null })
  decidedAt!: Date | null;

  @Prop({ type: Date, default: null })
  implementedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ChangeRequestSchema = SchemaFactory.createForClass(ChangeRequest);
ChangeRequestSchema.index({ workspaceId: 1, projectId: 1, number: 1 }, { unique: true });
ChangeRequestSchema.index({ workspaceId: 1, projectId: 1, status: 1 });
