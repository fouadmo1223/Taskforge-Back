import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { TASK_PRIORITIES, type TaskPriority } from '@flowdesk/types';

export type RequestDocument = HydratedDocument<Request>;

export const REQUEST_STATUSES = ['new', 'triage', 'accepted', 'declined', 'converted'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

@Schema({ timestamps: true, collection: 'requests' })
export class Request {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', default: null, index: true })
  projectId!: Types.ObjectId | null;

  @Prop({ required: true, trim: true, maxlength: 240 })
  title!: string;

  @Prop({ default: '', maxlength: 8000 })
  description!: string;

  @Prop({ type: String, enum: REQUEST_STATUSES, default: 'new', index: true })
  status!: RequestStatus;

  @Prop({ type: String, enum: TASK_PRIORITIES, default: 'medium' })
  priority!: TaskPriority;

  @Prop({ type: String, enum: ['form', 'portal', 'manual'], default: 'manual' })
  source!: 'form' | 'portal' | 'manual';

  @Prop({ type: Types.ObjectId, ref: 'Form', default: null })
  formId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'FormSubmission', default: null })
  formSubmissionId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Client', default: null, index: true })
  clientId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  requesterUserId!: Types.ObjectId | null;

  @Prop({ default: '' })
  requesterName!: string;

  @Prop({ type: String, default: '', lowercase: true })
  requesterEmail!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null, index: true })
  assigneeUserId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Task', default: null })
  linkedTaskId!: Types.ObjectId | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const RequestSchema = SchemaFactory.createForClass(Request);
RequestSchema.index({ workspaceId: 1, status: 1, createdAt: -1 });
