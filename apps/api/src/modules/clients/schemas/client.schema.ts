import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { CloudinaryAsset } from '@flowdesk/types';
import { CloudinaryAssetSchema } from '../../../common/db/cloudinary-asset.schema.js';

export type ClientDocument = HydratedDocument<Client>;

@Schema({ timestamps: true, collection: 'clients' })
export class Client {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 160 })
  name!: string;

  @Prop({ type: CloudinaryAssetSchema, default: null })
  logo!: CloudinaryAsset | null;

  @Prop({ default: '', maxlength: 120 })
  contactName!: string;

  @Prop({ type: String, default: '', lowercase: true, trim: true })
  contactEmail!: string;

  @Prop({ default: '', maxlength: 40 })
  contactPhone!: string;

  @Prop({ default: '', maxlength: 200 })
  website!: string;

  @Prop({ default: '', maxlength: 4000 })
  notes!: string;

  @Prop({ type: String, enum: ['active', 'archived'], default: 'active', index: true })
  status!: 'active' | 'archived';

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Project' }], default: [] })
  projectIds!: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdByUserId!: Types.ObjectId;

  @Prop({ type: Date, default: null, index: true })
  deletedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ClientSchema = SchemaFactory.createForClass(Client);
ClientSchema.index({ workspaceId: 1, status: 1, deletedAt: 1 });
ClientSchema.index({ workspaceId: 1, projectIds: 1 });
