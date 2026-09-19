import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { CloudinaryAsset } from '@flowdesk/types';
import { CloudinaryAssetSchema } from '../../../common/db/cloudinary-asset.schema.js';

export type ChatMessageDocument = HydratedDocument<ChatMessage>;

@Schema({ _id: false })
export class MessageReaction {
  @Prop({ required: true, maxlength: 16 })
  emoji!: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  userIds!: Types.ObjectId[];
}
const MessageReactionSchema = SchemaFactory.createForClass(MessageReaction);

@Schema({ timestamps: true, collection: 'chat_messages' })
export class ChatMessage {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true, index: true })
  conversationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  senderUserId!: Types.ObjectId;

  @Prop({ default: '', maxlength: 4000 })
  body!: string;

  @Prop({ type: CloudinaryAssetSchema, default: null })
  attachment!: CloudinaryAsset | null;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  mentionUserIds!: Types.ObjectId[];

  @Prop({ type: Date, default: null })
  editedAt!: Date | null;

  /** "delete for everyone" — hides it for all members */
  @Prop({ type: Date, default: null, index: true })
  deletedAt!: Date | null;

  /** "delete for me" — hides it only for these members, everyone else still sees it */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  deletedForUserIds!: Types.ObjectId[];

  /** set when this message is a forward of another one */
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  forwardedFromUserId!: Types.ObjectId | null;

  /** one entry per distinct emoji used on this message, each listing who reacted with it */
  @Prop({ type: [MessageReactionSchema], default: [] })
  reactions!: MessageReaction[];

  createdAt!: Date;
  updatedAt!: Date;
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);
ChatMessageSchema.index({ conversationId: 1, _id: -1 });

export type ChatReadDocument = HydratedDocument<ChatRead>;

@Schema({ timestamps: true, collection: 'chat_reads' })
export class ChatRead {
  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true, index: true })
  conversationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ChatMessage', default: null })
  lastReadMessageId!: Types.ObjectId | null;

  @Prop({ type: Date, default: () => new Date() })
  lastReadAt!: Date;
}

export const ChatReadSchema = SchemaFactory.createForClass(ChatRead);
ChatReadSchema.index({ conversationId: 1, userId: 1 }, { unique: true });
