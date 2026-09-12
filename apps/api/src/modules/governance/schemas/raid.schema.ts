import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  DECISION_STATUSES,
  ISSUE_STATUSES,
  RISK_SCALE,
  RISK_STATUSES,
  SEVERITIES,
  type DecisionStatus,
  type IssueStatus,
  type RiskScale,
  type RiskStatus,
  type Severity,
} from '@flowdesk/types';

// ── Risk ──────────────────────────────────────────────────────────────────

export type RiskDocument = HydratedDocument<Risk>;

@Schema({ timestamps: true, collection: 'risks' })
export class Risk {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 240 })
  title!: string;

  @Prop({ default: '', maxlength: 8000 })
  description!: string;

  @Prop({ type: String, enum: RISK_SCALE, default: 'medium' })
  probability!: RiskScale;

  @Prop({ type: String, enum: RISK_SCALE, default: 'medium' })
  impact!: RiskScale;

  /** derived from probability × impact on write */
  @Prop({ type: String, enum: SEVERITIES, default: 'medium', index: true })
  severity!: Severity;

  @Prop({ type: String, enum: RISK_STATUSES, default: 'open', index: true })
  status!: RiskStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  ownerUserId!: Types.ObjectId | null;

  @Prop({ default: '', maxlength: 4000 })
  mitigation!: string;

  @Prop({ default: '', maxlength: 4000 })
  contingency!: string;

  @Prop({ type: Date, default: null })
  reviewDate!: Date | null;

  @Prop({ type: Date, default: null })
  closedAt!: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdByUserId!: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}
export const RiskSchema = SchemaFactory.createForClass(Risk);
RiskSchema.index({ workspaceId: 1, projectId: 1, status: 1 });

// ── Issue ─────────────────────────────────────────────────────────────────

export type IssueDocument = HydratedDocument<Issue>;

@Schema({ timestamps: true, collection: 'issues' })
export class Issue {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 240 })
  title!: string;

  @Prop({ default: '', maxlength: 8000 })
  description!: string;

  @Prop({ type: String, enum: SEVERITIES, default: 'medium', index: true })
  severity!: Severity;

  @Prop({ type: String, enum: ISSUE_STATUSES, default: 'open', index: true })
  status!: IssueStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  ownerUserId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Risk', default: null })
  linkedRiskId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Task', default: null })
  linkedTaskId!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  dueDate!: Date | null;

  @Prop({ type: Date, default: null })
  resolvedAt!: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdByUserId!: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}
export const IssueSchema = SchemaFactory.createForClass(Issue);
IssueSchema.index({ workspaceId: 1, projectId: 1, status: 1 });

// ── Decision ──────────────────────────────────────────────────────────────

export type DecisionDocument = HydratedDocument<Decision>;

@Schema({ timestamps: true, collection: 'decisions' })
export class Decision {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 240 })
  title!: string;

  @Prop({ default: '', maxlength: 8000 })
  context!: string;

  @Prop({ default: '', maxlength: 8000 })
  decision!: string;

  @Prop({ type: String, enum: DECISION_STATUSES, default: 'proposed', index: true })
  status!: DecisionStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  decidedByUserId!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  decidedAt!: Date | null;

  /** the decision this one replaces */
  @Prop({ type: Types.ObjectId, ref: 'Decision', default: null })
  supersedesId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdByUserId!: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}
export const DecisionSchema = SchemaFactory.createForClass(Decision);
DecisionSchema.index({ workspaceId: 1, projectId: 1, status: 1 });

// ── shared: severity derivation ───────────────────────────────────────────

const SCALE_RANK: Record<RiskScale, number> = { very_low: 1, low: 2, medium: 3, high: 4, very_high: 5 };

export function deriveSeverity(probability: RiskScale, impact: RiskScale): Severity {
  const score = SCALE_RANK[probability] * SCALE_RANK[impact];
  if (score >= 16) return 'critical';
  if (score >= 9) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
}
