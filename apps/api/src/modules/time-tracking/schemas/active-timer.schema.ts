import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { TIMER_STATES, type TimerState } from '@flowdesk/types';

export type ActiveTimerDocument = HydratedDocument<ActiveTimer>;

/**
 * The running/paused timer for a user. At most one per user unless the workspace
 * allows concurrent timers. On stop it is converted into a {@link TimeEntry} and
 * deleted.
 */
@Schema({ timestamps: true, collection: 'active_timers' })
export class ActiveTimer {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true })
  projectId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Task', required: true })
  taskId!: Types.ObjectId;

  @Prop({ default: '', maxlength: 500 })
  description!: string;

  @Prop({ type: String, enum: TIMER_STATES, default: 'running' })
  state!: TimerState;

  /** wall-clock start of the whole session (for display) */
  @Prop({ required: true })
  startedAt!: Date;

  /** seconds accumulated before the current running span */
  @Prop({ default: 0, min: 0 })
  accumulatedSeconds!: number;

  /** when the current running span began; null while paused */
  @Prop({ type: Date, default: null })
  lastResumedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ActiveTimerSchema = SchemaFactory.createForClass(ActiveTimer);
ActiveTimerSchema.index({ workspaceId: 1, userId: 1 });
