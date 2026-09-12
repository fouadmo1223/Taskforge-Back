import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

/** Embedded sub-document mirroring the `CloudinaryAsset` shared type. */
@Schema({ _id: false })
export class CloudinaryAssetEmbed {
  @Prop({ required: true }) publicId!: string;
  @Prop({ required: true }) secureUrl!: string;
  @Prop({ type: String, required: true, enum: ['image', 'video', 'raw'] })
  resourceType!: 'image' | 'video' | 'raw';
  @Prop({ required: true }) format!: string;
  @Prop({ required: true }) bytes!: number;
  @Prop({ type: Number, default: null }) width!: number | null;
  @Prop({ type: Number, default: null }) height!: number | null;
  @Prop({ type: String, default: null }) originalFilename!: string | null;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) uploadedBy!: Types.ObjectId;
  @Prop({ type: Date, default: () => new Date() }) createdAt!: Date;
}

export const CloudinaryAssetSchema = SchemaFactory.createForClass(CloudinaryAssetEmbed);
