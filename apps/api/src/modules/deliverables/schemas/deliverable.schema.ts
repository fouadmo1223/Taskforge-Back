import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CloudinaryAssetSchema } from '../../../common/db/cloudinary-asset.schema.js';
import type { CloudinaryAssetEmbed } from '../../../common/db/cloudinary-asset.schema.js';

export type DeliverableDocument = HydratedDocument<Deliverable>;

export const DELIVERABLE_STATUSES = ['draft', 'in_review', 'approved', 'delivered', 'archived'] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];

@Schema({ _id: true, timestamps: { createdAt: true, updatedAt: false } })
export class DeliverableVersion {
  @Prop({ type: Types.ObjectId, auto: true }) _id!: Types.ObjectId;

  @Prop({ required: true }) version!: number;

  @Prop({ type: CloudinaryAssetSchema, required: true }) file!: CloudinaryAssetEmbed;

  @Prop({ default: '', maxlength: 2000 }) note!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) uploadedByUserId!: Types.ObjectId;

  /** Approval requested on this specific version, if any. */
  @Prop({ type: Types.ObjectId, ref: 'Approval', default: null }) approvalId!: Types.ObjectId | null;

  createdAt!: Date;
}
const DeliverableVersionSchema = SchemaFactory.createForClass(DeliverableVersion);

@Schema({ timestamps: true, collection: 'deliverables' })
export class Deliverable {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Milestone', default: null })
  milestoneId!: Types.ObjectId | null;

  @Prop({ required: true, trim: true, maxlength: 240 })
  title!: string;

  @Prop({ default: '', maxlength: 8000 })
  description!: string;

  @Prop({ type: String, enum: DELIVERABLE_STATUSES, default: 'draft', index: true })
  status!: DeliverableStatus;

  /** Whether this deliverable shows up in the client portal. */
  @Prop({ default: true })
  clientVisible!: boolean;

  @Prop({ type: Date, default: null })
  dueAt!: Date | null;

  @Prop({ type: [DeliverableVersionSchema], default: [] })
  versions!: DeliverableVersion[];

  /** Highest version number issued so far. */
  @Prop({ default: 0 })
  currentVersion!: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdByUserId!: Types.ObjectId;

  @Prop({ type: Date, default: null, index: true })
  deletedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const DeliverableSchema = SchemaFactory.createForClass(Deliverable);
DeliverableSchema.index({ workspaceId: 1, projectId: 1, deletedAt: 1 });
