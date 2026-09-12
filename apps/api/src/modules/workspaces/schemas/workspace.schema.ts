import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { CloudinaryAsset, Locale } from '@flowdesk/types';
import { CloudinaryAssetSchema } from '../../../common/db/cloudinary-asset.schema.js';

export type WorkspaceDocument = HydratedDocument<Workspace>;

@Schema({ _id: false })
export class WorkspaceSettings {
  @Prop({ type: String, default: null }) primaryColor!: string | null;
  @Prop({ type: String, default: null }) secondaryColor!: string | null;
  @Prop({ type: String, enum: ['en', 'ar'], default: 'en' }) defaultLocale!: Locale;
  @Prop({ type: String, default: 'UTC' }) timezone!: string;
  /** Allow more than one running timer per user. */
  @Prop({ default: false }) allowConcurrentTimers!: boolean;
  /** Expose finance data to client-portal users (still gated per project). */
  @Prop({ default: false }) clientsSeeFinance!: boolean;
}
const WorkspaceSettingsSchema = SchemaFactory.createForClass(WorkspaceSettings);

@Schema({ timestamps: true, collection: 'workspaces' })
export class Workspace {
  @Prop({ required: true, trim: true, maxlength: 80 })
  name!: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerUserId!: Types.ObjectId;

  @Prop({ type: CloudinaryAssetSchema, default: null })
  logo!: CloudinaryAsset | null;

  @Prop({ type: WorkspaceSettingsSchema, default: () => ({}) })
  settings!: WorkspaceSettings;

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  deletedBy!: Types.ObjectId | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const WorkspaceSchema = SchemaFactory.createForClass(Workspace);
WorkspaceSchema.index({ ownerUserId: 1, deletedAt: 1 });
