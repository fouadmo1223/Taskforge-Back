import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { TIMESHEET_STATUSES, type TimesheetStatus } from '@flowdesk/types';

export type TimesheetDocument = HydratedDocument<Timesheet>;

@Schema({ timestamps: true, collection: 'timesheets' })
export class Timesheet {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  /** Monday 00:00 UTC of the week */
  @Prop({ required: true })
  periodStart!: Date;

  @Prop({ required: true })
  periodEnd!: Date;

  @Prop({ type: String, enum: TIMESHEET_STATUSES, default: 'submitted', index: true })
  status!: TimesheetStatus;

  @Prop({ default: 0, min: 0 })
  totalSeconds!: number;

  @Prop({ type: Date, default: null })
  submittedAt!: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  reviewedByUserId!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  reviewedAt!: Date | null;

  @Prop({ type: String, default: null, maxlength: 1000 })
  reviewNote!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const TimesheetSchema = SchemaFactory.createForClass(Timesheet);
TimesheetSchema.index({ workspaceId: 1, userId: 1, periodStart: 1 }, { unique: true });
TimesheetSchema.index({ workspaceId: 1, status: 1, periodStart: -1 });
