import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  AUTOMATION_ACTIONS,
  AUTOMATION_TRIGGERS,
  type AutomationActionType,
  type AutomationTrigger,
} from '@flowdesk/types';

export type AutomationDocument = HydratedDocument<Automation>;

@Schema({ _id: false })
export class AutomationCondition {
  @Prop({ required: true, maxlength: 60 }) field!: string;
  @Prop({ type: String, required: true }) op!: string;
  @Prop({ type: Object, default: null }) value!: unknown;
}
const AutomationConditionSchema = SchemaFactory.createForClass(AutomationCondition);

@Schema({ _id: true })
export class AutomationAction {
  @Prop({ type: Types.ObjectId, auto: true }) _id!: Types.ObjectId;
  @Prop({ type: String, enum: AUTOMATION_ACTIONS, required: true }) type!: AutomationActionType;
  @Prop({ type: Object, default: {} }) config!: Record<string, unknown>;
}
const AutomationActionSchema = SchemaFactory.createForClass(AutomationAction);

@Schema({ _id: false })
export class AutomationTriggerSpec {
  @Prop({ type: String, enum: AUTOMATION_TRIGGERS, required: true }) type!: AutomationTrigger;
  @Prop({ type: Object, default: {} }) config!: Record<string, unknown>;
}
const AutomationTriggerSchema = SchemaFactory.createForClass(AutomationTriggerSpec);

@Schema({ timestamps: true, collection: 'automations' })
export class Automation {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 160 })
  name!: string;

  @Prop({ default: true, index: true })
  active!: boolean;

  /** null = workspace-wide */
  @Prop({ type: Types.ObjectId, ref: 'Project', default: null, index: true })
  projectId!: Types.ObjectId | null;

  @Prop({ type: AutomationTriggerSchema, required: true })
  trigger!: AutomationTriggerSpec;

  @Prop({ type: [AutomationConditionSchema], default: [] })
  conditions!: AutomationCondition[];

  @Prop({ type: [AutomationActionSchema], default: [] })
  actions!: AutomationAction[];

  @Prop({ default: 0 })
  runCount!: number;

  @Prop({ type: Date, default: null })
  lastRunAt!: Date | null;

  @Prop({ default: '', maxlength: 1000 })
  lastError!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdByUserId!: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}
export const AutomationSchema = SchemaFactory.createForClass(Automation);
AutomationSchema.index({ workspaceId: 1, active: 1, 'trigger.type': 1 });

export type AutomationRunDocument = HydratedDocument<AutomationRun>;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'automation_runs' })
export class AutomationRun {
  @Prop({ type: Types.ObjectId, ref: 'Automation', required: true, index: true })
  automationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: String, enum: ['success', 'partial', 'failed', 'skipped'], required: true })
  status!: 'success' | 'partial' | 'failed' | 'skipped';

  @Prop({ default: '' })
  trigger!: string;

  @Prop({ type: [String], default: [] })
  actionsRun!: string[];

  @Prop({ default: '', maxlength: 2000 })
  error!: string;

  @Prop({ type: Types.ObjectId, ref: 'Task', default: null })
  subjectTaskId!: Types.ObjectId | null;

  createdAt!: Date;
}
export const AutomationRunSchema = SchemaFactory.createForClass(AutomationRun);
AutomationRunSchema.index({ automationId: 1, createdAt: -1 });
