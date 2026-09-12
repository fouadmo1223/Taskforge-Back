import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TimeEntryDocument = HydratedDocument<TimeEntry>;

/** A finalised block of logged time against a task. */
@Schema({ timestamps: true, collection: 'time_entries' })
export class TimeEntry {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Task', required: true, index: true })
  taskId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ default: '', maxlength: 500 })
  description!: string;

  @Prop({ required: true })
  startedAt!: Date;

  @Prop({ required: true })
  endedAt!: Date;

  @Prop({ required: true, min: 0 })
  durationSeconds!: number;

  @Prop({ type: String, enum: ['timer', 'manual'], default: 'manual' })
  source!: 'timer' | 'manual';

  /** set once the entry is rolled into a submitted timesheet; then it is locked */
  @Prop({ type: Types.ObjectId, ref: 'Timesheet', default: null, index: true })
  timesheetId!: Types.ObjectId | null;

  @Prop({ type: Boolean, default: false })
  locked!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const TimeEntrySchema = SchemaFactory.createForClass(TimeEntry);
TimeEntrySchema.index({ workspaceId: 1, userId: 1, startedAt: -1 });
TimeEntrySchema.index({ taskId: 1, startedAt: -1 });
