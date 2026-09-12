import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { GOAL_STATUSES, GOAL_TYPES, type GoalStatus, type GoalType } from '@flowdesk/types';

export type GoalDocument = HydratedDocument<Goal>;

@Schema({ _id: true })
export class KeyResult {
  @Prop({ type: Types.ObjectId, auto: true }) _id!: Types.ObjectId;
  @Prop({ required: true, maxlength: 240 }) title!: string;
  @Prop({ type: Number, default: 0 }) start!: number;
  @Prop({ type: Number, default: 100 }) target!: number;
  @Prop({ type: Number, default: 0 }) current!: number;
  @Prop({ default: '', maxlength: 20 }) unit!: string;
}
const KeyResultSchema = SchemaFactory.createForClass(KeyResult);

@Schema({ timestamps: true, collection: 'goals' })
export class Goal {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 240 })
  title!: string;

  @Prop({ default: '', maxlength: 4000 })
  description!: string;

  @Prop({ type: String, enum: GOAL_TYPES, default: 'percent' })
  type!: GoalType;

  @Prop({ type: Number, default: 0 })
  start!: number;

  @Prop({ type: Number, default: 100 })
  target!: number;

  @Prop({ type: Number, default: 0 })
  current!: number;

  @Prop({ default: '', maxlength: 20 })
  unit!: string;

  @Prop({ type: String, enum: GOAL_STATUSES, default: 'on_track', index: true })
  status!: GoalStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  ownerUserId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Portfolio', default: null, index: true })
  portfolioId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Project', default: null, index: true })
  projectId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Goal', default: null })
  parentGoalId!: Types.ObjectId | null;

  @Prop({ type: [KeyResultSchema], default: [] })
  keyResults!: KeyResult[];

  @Prop({ type: Date, default: null })
  dueDate!: Date | null;

  @Prop({ type: Date, default: null })
  closedAt!: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdByUserId!: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const GoalSchema = SchemaFactory.createForClass(Goal);
GoalSchema.index({ workspaceId: 1, status: 1 });
