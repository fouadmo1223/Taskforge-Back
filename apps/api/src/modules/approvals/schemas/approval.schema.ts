import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  APPROVAL_DECISIONS,
  APPROVAL_STATUSES,
  APPROVAL_STRATEGIES,
  type ApprovalDecision,
  type ApprovalStatus,
  type ApprovalStrategy,
} from '@flowdesk/types';

export type ApprovalDocument = HydratedDocument<Approval>;

@Schema({ _id: true, timestamps: true })
export class ApprovalStep {
  @Prop({ type: Types.ObjectId, auto: true }) _id!: Types.ObjectId;
  @Prop({ required: true }) order!: number;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) approverUserId!: Types.ObjectId;
  @Prop({ type: String, enum: APPROVAL_DECISIONS, default: null }) decision!: ApprovalDecision | null;
  @Prop({ default: '', maxlength: 2000 }) comment!: string;
  @Prop({ type: Date, default: null }) decidedAt!: Date | null;
}
const ApprovalStepSchema = SchemaFactory.createForClass(ApprovalStep);

@Schema({ timestamps: true, collection: 'approvals' })
export class Approval {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: String, enum: ['task', 'deliverable', 'change_request', 'document', 'request'], required: true })
  subjectType!: 'task' | 'deliverable' | 'change_request' | 'document' | 'request';

  @Prop({ type: Types.ObjectId, required: true, index: true })
  subjectId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', default: null, index: true })
  projectId!: Types.ObjectId | null;

  @Prop({ required: true, maxlength: 240 })
  title!: string;

  @Prop({ default: '', maxlength: 4000 })
  description!: string;

  @Prop({ type: String, enum: APPROVAL_STRATEGIES, required: true })
  strategy!: ApprovalStrategy;

  /** for `n_of_m` */
  @Prop({ default: 1, min: 1 })
  requiredCount!: number;

  @Prop({ type: [ApprovalStepSchema], default: [] })
  steps!: ApprovalStep[];

  @Prop({ type: String, enum: APPROVAL_STATUSES, default: 'pending', index: true })
  status!: ApprovalStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  requestedByUserId!: Types.ObjectId;

  @Prop({ type: Date, default: null })
  decidedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ApprovalSchema = SchemaFactory.createForClass(Approval);
ApprovalSchema.index({ workspaceId: 1, subjectType: 1, subjectId: 1 });
ApprovalSchema.index({ workspaceId: 1, 'steps.approverUserId': 1, status: 1 });
