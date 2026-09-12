import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { FORM_FIELD_TYPES, FORM_VISIBILITY, TASK_PRIORITIES, type FormFieldType, type FormVisibility, type TaskPriority } from '@flowdesk/types';

export type FormDocument = HydratedDocument<Form>;

@Schema({ _id: false })
export class FormFieldOption {
  @Prop({ required: true }) label!: string;
  @Prop({ required: true }) value!: string;
}
const FormFieldOptionSchema = SchemaFactory.createForClass(FormFieldOption);

@Schema({ _id: false })
export class FormField {
  @Prop({ required: true }) id!: string;
  @Prop({ type: String, enum: FORM_FIELD_TYPES, required: true }) type!: FormFieldType;
  @Prop({ required: true, maxlength: 200 }) label!: string;
  @Prop({ default: '', maxlength: 500 }) description!: string;
  @Prop({ default: '', maxlength: 200 }) placeholder!: string;
  @Prop({ default: false }) required!: boolean;
  @Prop({ type: [FormFieldOptionSchema], default: [] }) options!: FormFieldOption[];
  @Prop({ required: true }) order!: number;
}
const FormFieldSchema = SchemaFactory.createForClass(FormField);

@Schema({ _id: false })
export class FormRouting {
  @Prop({ default: false }) enabled!: boolean;
  @Prop({ type: Types.ObjectId, ref: 'Project', default: null }) projectId!: Types.ObjectId | null;
  @Prop({ type: Types.ObjectId, ref: 'User', default: null }) assigneeUserId!: Types.ObjectId | null;
  @Prop({ type: String, enum: TASK_PRIORITIES, default: 'medium' }) priority!: TaskPriority;
}
const FormRoutingSchema = SchemaFactory.createForClass(FormRouting);

@Schema({ timestamps: true, collection: 'forms' })
export class Form {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', default: null })
  projectId!: Types.ObjectId | null;

  @Prop({ required: true, trim: true, maxlength: 160 })
  title!: string;

  @Prop({ default: '', maxlength: 2000 })
  description!: string;

  /** globally unique — public forms are reachable at /public/forms/:slug */
  @Prop({ required: true, unique: true })
  slug!: string;

  @Prop({ type: String, enum: FORM_VISIBILITY, default: 'private', index: true })
  visibility!: FormVisibility;

  @Prop({ type: String, enum: ['draft', 'published', 'closed'], default: 'draft', index: true })
  status!: 'draft' | 'published' | 'closed';

  @Prop({ type: [FormFieldSchema], default: [] })
  fields!: FormField[];

  @Prop({ default: 'Thanks — we’ve received your submission.', maxlength: 500 })
  successMessage!: string;

  @Prop({ type: FormRoutingSchema, default: () => ({}) })
  routing!: FormRouting;

  @Prop({ default: 0 })
  submissionCount!: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdByUserId!: Types.ObjectId;

  @Prop({ type: Date, default: null, index: true })
  deletedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const FormSchema = SchemaFactory.createForClass(Form);
FormSchema.index({ workspaceId: 1, status: 1, deletedAt: 1 });

export type FormSubmissionDocument = HydratedDocument<FormSubmission>;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'form_submissions' })
export class FormSubmission {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Form', required: true, index: true })
  formId!: Types.ObjectId;

  @Prop({ type: Object, default: {} })
  answers!: Record<string, unknown>;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  submitterUserId!: Types.ObjectId | null;

  @Prop({ default: '' })
  submitterName!: string;

  @Prop({ type: String, default: '', lowercase: true })
  submitterEmail!: string;

  @Prop({ type: String, default: null })
  ip!: string | null;

  @Prop({ type: Types.ObjectId, ref: 'Request', default: null })
  requestId!: Types.ObjectId | null;

  createdAt!: Date;
}

export const FormSubmissionSchema = SchemaFactory.createForClass(FormSubmission);
FormSubmissionSchema.index({ formId: 1, createdAt: -1 });
