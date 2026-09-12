import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ConversationDocument = HydratedDocument<Conversation>;

@Schema({ timestamps: true, collection: 'conversations' })
export class Conversation {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: String, enum: ['direct', 'group'], required: true })
  type!: 'direct' | 'group';

  /** group only */
  @Prop({ type: String, default: null, maxlength: 80 })
  name!: string | null;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], required: true, index: true })
  memberUserIds!: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdByUserId!: Types.ObjectId;

  /** `w:<sortedA>:<sortedB>` — dedupes direct conversations */
  @Prop({ type: String, default: null })
  directKey!: string | null;

  @Prop({ type: Date, default: () => new Date(), index: true })
  lastMessageAt!: Date;

  @Prop({ type: String, default: '' })
  lastMessagePreview!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  lastMessageSenderUserId!: Types.ObjectId | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);
ConversationSchema.index({ workspaceId: 1, directKey: 1 }, { unique: true, partialFilterExpression: { directKey: { $type: 'string' } } });
ConversationSchema.index({ memberUserIds: 1, lastMessageAt: -1 });
