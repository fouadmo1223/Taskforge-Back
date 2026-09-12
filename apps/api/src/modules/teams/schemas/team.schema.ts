import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TeamDocument = HydratedDocument<Team>;

@Schema({ timestamps: true, collection: 'teams' })
export class Team {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 120 })
  name!: string;

  @Prop({ default: '', maxlength: 1000 })
  description!: string;

  @Prop({ type: String, default: '#0ea5e9' })
  color!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  leadUserId!: Types.ObjectId | null;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [], index: true })
  memberUserIds!: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdByUserId!: Types.ObjectId;

  @Prop({ type: Date, default: null, index: true })
  archivedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const TeamSchema = SchemaFactory.createForClass(Team);
TeamSchema.index({ workspaceId: 1, archivedAt: 1 });
