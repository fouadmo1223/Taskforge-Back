import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { MILESTONE_STATUSES, type MilestoneStatus } from '@flowdesk/types';

export type MilestoneDocument = HydratedDocument<Milestone>;

@Schema({ timestamps: true, collection: 'milestones' })
export class Milestone {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 160 })
  name!: string;

  @Prop({ default: '', maxlength: 2000 })
  description!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  ownerUserId!: Types.ObjectId | null;

  @Prop({ type: Date, required: true, index: true })
  date!: Date;

  @Prop({ type: String, enum: MILESTONE_STATUSES, default: 'planned' })
  status!: MilestoneStatus;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Task' }], default: [] })
  taskIds!: Types.ObjectId[];

  @Prop({ type: Date, default: null, index: true })
  deletedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const MilestoneSchema = SchemaFactory.createForClass(Milestone);
MilestoneSchema.index({ projectId: 1, date: 1, deletedAt: 1 });
