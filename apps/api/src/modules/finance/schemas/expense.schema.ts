import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { EXPENSE_STATUSES, type ExpenseStatus } from '@flowdesk/types';
import { CloudinaryAssetSchema } from '../../../common/db/cloudinary-asset.schema.js';
import type { CloudinaryAssetEmbed } from '../../../common/db/cloudinary-asset.schema.js';

export type ExpenseDocument = HydratedDocument<Expense>;

@Schema({ timestamps: true, collection: 'expenses' })
export class Expense {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Task', default: null })
  taskId!: Types.ObjectId | null;

  @Prop({ required: true, trim: true, maxlength: 240 })
  description!: string;

  @Prop({ required: true, min: 0 })
  amount!: number;

  @Prop({ type: String, default: 'USD', maxlength: 3, uppercase: true })
  currency!: string;

  @Prop({ default: '', trim: true, maxlength: 80 })
  category!: string;

  @Prop({ type: Date, required: true })
  spentAt!: Date;

  /** billable back to the client */
  @Prop({ default: false })
  billable!: boolean;

  @Prop({ type: String, enum: EXPENSE_STATUSES, default: 'draft', index: true })
  status!: ExpenseStatus;

  @Prop({ type: CloudinaryAssetSchema, default: null })
  receipt!: CloudinaryAssetEmbed | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  submittedByUserId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  reviewedByUserId!: Types.ObjectId | null;

  @Prop({ default: '', maxlength: 1000 })
  reviewNote!: string;

  @Prop({ type: Date, default: null })
  reviewedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ExpenseSchema = SchemaFactory.createForClass(Expense);
ExpenseSchema.index({ workspaceId: 1, projectId: 1, status: 1 });
ExpenseSchema.index({ workspaceId: 1, spentAt: -1 });
