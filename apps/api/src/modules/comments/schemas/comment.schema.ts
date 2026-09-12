import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { COMMENT_VISIBILITY, type CommentVisibility } from '@flowdesk/types';

export type CommentDocument = HydratedDocument<Comment>;

@Schema({ timestamps: true, collection: 'comments' })
export class Comment {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Task', required: true, index: true })
  taskId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  authorUserId!: Types.ObjectId;

  /** Tiptap HTML */
  @Prop({ required: true })
  bodyHtml!: string;

  /** plain-text projection for search / notifications */
  @Prop({ default: '' })
  bodyText!: string;

  @Prop({ type: String, enum: COMMENT_VISIBILITY, default: 'internal', index: true })
  visibility!: CommentVisibility;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  mentionUserIds!: Types.ObjectId[];

  @Prop({ type: Date, default: null })
  editedAt!: Date | null;

  @Prop({ type: Date, default: null, index: true })
  deletedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);
CommentSchema.index({ taskId: 1, deletedAt: 1, createdAt: 1 });
