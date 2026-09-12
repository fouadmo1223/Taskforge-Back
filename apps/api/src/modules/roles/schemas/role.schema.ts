import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { PERMISSIONS, type Permission } from '@flowdesk/types';

export type RoleDocument = HydratedDocument<Role>;

@Schema({ timestamps: true, collection: 'roles' })
export class Role {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  /** Stable machine key (`owner`, `admin`, ...). Custom roles get a generated key. */
  @Prop({ required: true })
  key!: string;

  @Prop({ required: true, trim: true, maxlength: 60 })
  name!: string;

  @Prop({ default: '', maxlength: 240 })
  description!: string;

  @Prop({ type: [String], enum: PERMISSIONS, default: [] })
  permissions!: Permission[];

  /** Seeded preset — cannot be deleted; `owner` cannot be edited. */
  @Prop({ default: false })
  system!: boolean;

  /** The role new members receive unless one is chosen explicitly. */
  @Prop({ default: false })
  isDefault!: boolean;

  /** `owner` holds every permission implicitly and bypasses permission checks. */
  @Prop({ default: false })
  isOwner!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const RoleSchema = SchemaFactory.createForClass(Role);

RoleSchema.index({ workspaceId: 1, key: 1 }, { unique: true });
RoleSchema.index({ workspaceId: 1, isDefault: 1 });
