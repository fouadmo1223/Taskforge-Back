import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { SEVERITIES, SLA_STATES, TASK_PRIORITIES, type SlaState, type TaskPriority } from '@flowdesk/types';

export type TaskDocument = HydratedDocument<Task>;

@Schema({ _id: true })
export class ChecklistItem {
  @Prop({ type: Types.ObjectId, auto: true }) _id!: Types.ObjectId;
  @Prop({ required: true, maxlength: 500 }) text!: string;
  @Prop({ default: false }) done!: boolean;
  @Prop({ type: Types.ObjectId, ref: 'User', default: null }) doneByUserId!: Types.ObjectId | null;
  @Prop({ type: Date, default: null }) doneAt!: Date | null;
  @Prop({ required: true }) rank!: string;
}
const ChecklistItemSchema = SchemaFactory.createForClass(ChecklistItem);

@Schema({ _id: true })
export class Checklist {
  @Prop({ type: Types.ObjectId, auto: true }) _id!: Types.ObjectId;
  @Prop({ required: true, maxlength: 120 }) title!: string;
  @Prop({ type: [ChecklistItemSchema], default: [] }) items!: ChecklistItem[];
  @Prop({ required: true }) rank!: string;
}
const ChecklistSchema = SchemaFactory.createForClass(Checklist);

@Schema({ timestamps: true, collection: 'tasks' })
export class Task {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Board', required: true, index: true })
  boardId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'BoardColumn', required: true, index: true })
  columnId!: Types.ObjectId;

  /** human key, e.g. `MKT-42`; unique per workspace */
  @Prop({ required: true })
  key!: string;

  @Prop({ required: true, trim: true, maxlength: 300 })
  title!: string;

  /** Tiptap HTML */
  @Prop({ default: '' })
  description!: string;

  @Prop({ type: String, default: 'task' })
  type!: string;

  @Prop({ type: String, enum: TASK_PRIORITIES, default: 'none', index: true })
  priority!: TaskPriority;

  @Prop({ type: String, enum: SEVERITIES, default: null })
  severity!: string | null;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [], index: true })
  assigneeUserIds!: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  reporterUserId!: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  followerUserIds!: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Label' }], default: [] })
  labelIds!: Types.ObjectId[];

  @Prop({ type: Date, default: null })
  startDate!: Date | null;

  @Prop({ type: Date, default: null, index: true })
  dueDate!: Date | null;

  @Prop({ type: Number, default: null, min: 0 })
  estimateHours!: number | null;

  /** rollup maintained by the time-tracking module */
  @Prop({ default: 0, min: 0 })
  loggedHours!: number;

  @Prop({ type: Types.ObjectId, ref: 'Task', default: null, index: true })
  parentTaskId!: Types.ObjectId | null;

  /** denormalised depth (0 = top level) to cap nesting cheaply */
  @Prop({ default: 0 })
  depth!: number;

  @Prop({ type: Types.ObjectId, ref: 'Milestone', default: null, index: true })
  milestoneId!: Types.ObjectId | null;

  @Prop({ type: Object, default: {} })
  customFields!: Record<string, unknown>;

  @Prop({ type: [ChecklistSchema], default: [] })
  checklists!: Checklist[];

  /** lexorank within `columnId` (board order) */
  @Prop({ required: true, index: true })
  rank!: string;

  @Prop({ default: false, index: true })
  clientVisible!: boolean;

  @Prop({ type: String, enum: SLA_STATES, default: 'ok' })
  slaState!: SlaState;

  @Prop({ type: Date, default: null })
  completedAt!: Date | null;

  @Prop({ type: Number, default: 0 })
  commentCount!: number;

  @Prop({ type: Number, default: 0 })
  attachmentCount!: number;

  @Prop({ type: Number, default: 0 })
  subtaskCount!: number;

  /** direct children whose `completedAt` is set — drives the parent's progress % */
  @Prop({ type: Number, default: 0 })
  subtaskDoneCount!: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdByUserId!: Types.ObjectId;

  @Prop({ type: Date, default: null })
  archivedAt!: Date | null;

  @Prop({ type: Date, default: null, index: true })
  deletedAt!: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  deletedBy!: Types.ObjectId | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const TaskSchema = SchemaFactory.createForClass(Task);

// Query patterns: board render, my-work, filters, subtree.
TaskSchema.index({ columnId: 1, deletedAt: 1, rank: 1 });
TaskSchema.index({ workspaceId: 1, key: 1 }, { unique: true });
TaskSchema.index({ projectId: 1, deletedAt: 1 });
TaskSchema.index({ workspaceId: 1, assigneeUserIds: 1, dueDate: 1 });
TaskSchema.index({ parentTaskId: 1, deletedAt: 1, rank: 1 });
TaskSchema.index({ workspaceId: 1, milestoneId: 1 });
