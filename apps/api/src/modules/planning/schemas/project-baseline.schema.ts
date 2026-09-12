import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ProjectBaselineDocument = HydratedDocument<ProjectBaseline>;

@Schema({ _id: false })
export class BaselineEntry {
  @Prop({ type: Types.ObjectId, required: true }) taskId!: Types.ObjectId;
  @Prop({ type: Date, default: null }) startDate!: Date | null;
  @Prop({ type: Date, default: null }) dueDate!: Date | null;
}
const BaselineEntrySchema = SchemaFactory.createForClass(BaselineEntry);

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'project_baselines' })
export class ProjectBaseline {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ required: true, maxlength: 120 })
  name!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdByUserId!: Types.ObjectId;

  @Prop({ type: [BaselineEntrySchema], default: [] })
  entries!: BaselineEntry[];

  createdAt!: Date;
}

export const ProjectBaselineSchema = SchemaFactory.createForClass(ProjectBaseline);
ProjectBaselineSchema.index({ projectId: 1, createdAt: -1 });
