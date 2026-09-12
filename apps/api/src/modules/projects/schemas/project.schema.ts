import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  PROJECT_STATUSES,
  PROJECT_VISIBILITY,
  type CloudinaryAsset,
  type ProjectStatus,
  type ProjectVisibility,
} from '@flowdesk/types';
import { CloudinaryAssetSchema } from '../../../common/db/cloudinary-asset.schema.js';

export type ProjectDocument = HydratedDocument<Project>;

@Schema({ timestamps: true, collection: 'projects' })
export class Project {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  /** Short uppercase code, unique per workspace. Task keys are `<KEY>-<n>`. */
  @Prop({ required: true, uppercase: true, trim: true, minlength: 2, maxlength: 6 })
  key!: string;

  @Prop({ required: true, trim: true, maxlength: 120 })
  name!: string;

  @Prop({ default: '', maxlength: 2000 })
  description!: string;

  @Prop({ type: String, enum: PROJECT_STATUSES, default: 'active', index: true })
  status!: ProjectStatus;

  @Prop({ type: String, default: '#4f46e5' })
  color!: string;

  @Prop({ type: CloudinaryAssetSchema, default: null })
  cover!: CloudinaryAsset | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  leadUserId!: Types.ObjectId | null;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  memberUserIds!: Types.ObjectId[];

  /** Access model. `workspace` = everyone; `team` = members of `teamIds`; `private` = `memberUserIds`. */
  @Prop({ type: String, enum: PROJECT_VISIBILITY, default: 'workspace', index: true })
  visibility!: ProjectVisibility;

  /** Teams granted access when `visibility === 'team'`. */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Team' }], default: [] })
  teamIds!: Types.ObjectId[];

  @Prop({ type: Date, default: null })
  startDate!: Date | null;

  @Prop({ type: Date, default: null })
  endDate!: Date | null;

  /** Running counter for task key allocation (`<KEY>-<taskCounter>`). */
  @Prop({ default: 0 })
  taskCounter!: number;

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

export const ProjectSchema = SchemaFactory.createForClass(Project);
ProjectSchema.index({ workspaceId: 1, key: 1 }, { unique: true });
ProjectSchema.index({ workspaceId: 1, status: 1, deletedAt: 1 });
ProjectSchema.index({ workspaceId: 1, memberUserIds: 1 });
ProjectSchema.index({ workspaceId: 1, teamIds: 1 });
