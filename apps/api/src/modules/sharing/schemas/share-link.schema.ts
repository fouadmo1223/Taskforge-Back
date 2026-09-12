import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { SHARE_RESOURCE_TYPES, type ShareResourceType } from '@flowdesk/types';

export type ShareLinkDocument = HydratedDocument<ShareLink>;

@Schema({ timestamps: true, collection: 'share_links' })
export class ShareLink {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: String, enum: SHARE_RESOURCE_TYPES, required: true })
  resourceType!: ShareResourceType;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  resourceId!: Types.ObjectId;

  /** opaque, URL-safe; the public link is /share/:token */
  @Prop({ required: true, unique: true })
  token!: string;

  @Prop({ type: Date, default: null })
  expiresAt!: Date | null;

  @Prop({ type: Date, default: null, index: true })
  revokedAt!: Date | null;

  @Prop({ default: 0 })
  viewCount!: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdByUserId!: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ShareLinkSchema = SchemaFactory.createForClass(ShareLink);
ShareLinkSchema.index({ workspaceId: 1, resourceType: 1, resourceId: 1 });
