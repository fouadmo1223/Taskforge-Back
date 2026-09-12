import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { SLA_STATES, TASK_PRIORITIES, type SlaState, type TaskPriority } from '@flowdesk/types';

// ── policy ────────────────────────────────────────────────────────────────

export type SlaPolicyDocument = HydratedDocument<SlaPolicy>;

@Schema({ _id: false })
export class SlaAppliesTo {
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Project' }], default: [] }) projectIds!: Types.ObjectId[];
  @Prop({ type: [String], enum: TASK_PRIORITIES, default: [] }) priorities!: TaskPriority[];
  @Prop({ type: [String], default: [] }) types!: string[];
}
const SlaAppliesToSchema = SchemaFactory.createForClass(SlaAppliesTo);

@Schema({ timestamps: true, collection: 'sla_policies' })
export class SlaPolicy {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 120 })
  name!: string;

  @Prop({ default: true, index: true })
  active!: boolean;

  @Prop({ type: SlaAppliesToSchema, default: () => ({}) })
  appliesTo!: SlaAppliesTo;

  /** hours from start to first response */
  @Prop({ required: true, min: 0 })
  responseHours!: number;

  /** hours from start to resolution */
  @Prop({ required: true, min: 0 })
  resolutionHours!: number;

  /** raise a warning once this % of a target has elapsed */
  @Prop({ default: 80, min: 1, max: 100 })
  warnAtPercent!: number;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  notifyUserIds!: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  escalateToUserIds!: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdByUserId!: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}
export const SlaPolicySchema = SchemaFactory.createForClass(SlaPolicy);

// ── tracker (one per task under a policy) ─────────────────────────────────

export type SlaTrackerDocument = HydratedDocument<SlaTracker>;

@Schema({ timestamps: true, collection: 'sla_trackers' })
export class SlaTracker {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Task', required: true, unique: true })
  taskId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'SlaPolicy', required: true, index: true })
  policyId!: Types.ObjectId;

  @Prop({ type: Date, required: true })
  startedAt!: Date;

  @Prop({ type: Date, required: true })
  responseDueAt!: Date;

  @Prop({ type: Date, required: true })
  resolutionDueAt!: Date;

  @Prop({ type: Date, default: null })
  firstResponseAt!: Date | null;

  @Prop({ type: Date, default: null })
  resolvedAt!: Date | null;

  @Prop({ type: String, enum: SLA_STATES, default: 'ok', index: true })
  state!: SlaState;

  /** 0 = none, 1 = warned, 2 = escalated on breach */
  @Prop({ default: 0 })
  escalationLevel!: number;

  @Prop({ type: Date, default: null })
  lastEvaluatedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}
export const SlaTrackerSchema = SchemaFactory.createForClass(SlaTracker);
SlaTrackerSchema.index({ workspaceId: 1, projectId: 1, state: 1 });
