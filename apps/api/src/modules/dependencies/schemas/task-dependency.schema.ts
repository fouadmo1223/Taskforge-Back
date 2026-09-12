import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { DEPENDENCY_TYPES, type DependencyType } from '@flowdesk/types';

export type TaskDependencyDocument = HydratedDocument<TaskDependency>;

/**
 * A directed relationship `fromTaskId --type--> toTaskId`. Scheduling types
 * (`blocks`, `blocked_by`, `starts_after`, `finishes_before`) form an acyclic
 * predecessor graph; `related_to` / `duplicate_of` are informational only.
 */
@Schema({ timestamps: true, collection: 'task_dependencies' })
export class TaskDependency {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Task', required: true, index: true })
  fromTaskId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Task', required: true, index: true })
  toTaskId!: Types.ObjectId;

  @Prop({ type: String, enum: DEPENDENCY_TYPES, required: true })
  type!: DependencyType;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdByUserId!: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const TaskDependencySchema = SchemaFactory.createForClass(TaskDependency);
TaskDependencySchema.index({ fromTaskId: 1, toTaskId: 1, type: 1 }, { unique: true });
TaskDependencySchema.index({ projectId: 1 });
