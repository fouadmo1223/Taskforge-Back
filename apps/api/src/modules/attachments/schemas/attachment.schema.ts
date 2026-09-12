import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CloudinaryAssetSchema } from '../../../common/db/cloudinary-asset.schema.js';
import type { CloudinaryAssetEmbed } from '../../../common/db/cloudinary-asset.schema.js';

export type AttachmentDocument = HydratedDocument<Attachment>;

@Schema({ timestamps: true, collection: 'attachments' })
export class Attachment {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', default: null, index: true })
  projectId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Task', default: null, index: true })
  taskId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Comment', default: null, index: true })
  commentId!: Types.ObjectId | null;

  @Prop({ required: true, maxlength: 260 })
  name!: string;

  @Prop({ type: CloudinaryAssetSchema, required: true })
  asset!: CloudinaryAssetEmbed;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  uploaderUserId!: Types.ObjectId;

  /** shared into the client portal alongside a client-visible task */
  @Prop({ default: false })
  clientVisible!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AttachmentSchema = SchemaFactory.createForClass(Attachment);
AttachmentSchema.index({ taskId: 1, createdAt: -1 });
