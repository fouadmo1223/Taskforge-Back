import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { Permission } from '@flowdesk/types';

export type ApiTokenDocument = HydratedDocument<ApiToken>;

@Schema({ timestamps: true, collection: 'api_tokens' })
export class ApiToken {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 120 })
  name!: string;

  /** sha256 of the raw token; the raw value is shown once at creation */
  @Prop({ required: true, unique: true })
  tokenHash!: string;

  /** first chars of the raw token, for display (e.g. `fdk_ab12…`) */
  @Prop({ required: true })
  prefix!: string;

  /** permission subset this token may exercise (must be a subset of the creator's) */
  @Prop({ type: [String], default: [] })
  scopes!: Permission[];

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdByUserId!: Types.ObjectId;

  @Prop({ type: Date, default: null })
  lastUsedAt!: Date | null;

  @Prop({ type: Date, default: null })
  expiresAt!: Date | null;

  @Prop({ type: Date, default: null, index: true })
  revokedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ApiTokenSchema = SchemaFactory.createForClass(ApiToken);
ApiTokenSchema.index({ workspaceId: 1, revokedAt: 1 });
