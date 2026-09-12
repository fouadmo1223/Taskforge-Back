import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { RECURRENCE_FREQ, TASK_PRIORITIES, type RecurrenceFreq, type TaskPriority } from '@flowdesk/types';

export type RecurringTaskDocument = HydratedDocument<RecurringTask>;

@Schema({ _id: false })
export class Cadence {
  @Prop({ type: String, enum: RECURRENCE_FREQ, required: true }) freq!: RecurrenceFreq;
  @Prop({ type: Number, default: 1, min: 1, max: 52 }) interval!: number;
  /** weekly: 0=Sun … 6=Sat */
  @Prop({ type: [Number], default: [] }) byWeekday!: number[];
  /** monthly: 1–31 */
  @Prop({ type: Number, default: null }) byMonthDay!: number | null;
  /** minutes past midnight (workspace-local, applied in UTC for v1) */
  @Prop({ type: Number, default: 540 }) atMinute!: number;
}
const CadenceSchema = SchemaFactory.createForClass(Cadence);

@Schema({ timestamps: true, collection: 'recurring_tasks' })
export class RecurringTask {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'BoardColumn', default: null })
  columnId!: Types.ObjectId | null;

  @Prop({ required: true, trim: true, maxlength: 300 })
  title!: string;

  @Prop({ default: '', maxlength: 8000 })
  description!: string;

  @Prop({ type: String, enum: TASK_PRIORITIES, default: 'none' })
  priority!: TaskPriority;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  assigneeUserIds!: Types.ObjectId[];

  @Prop({ type: CadenceSchema, required: true })
  cadence!: Cadence;

  @Prop({ default: true, index: true })
  active!: boolean;

  @Prop({ type: Date, required: true, index: true })
  nextRunAt!: Date;

  @Prop({ type: Date, default: null })
  lastRunAt!: Date | null;

  @Prop({ default: 0 })
  createdCount!: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdByUserId!: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const RecurringTaskSchema = SchemaFactory.createForClass(RecurringTask);
RecurringTaskSchema.index({ workspaceId: 1, active: 1, nextRunAt: 1 });
