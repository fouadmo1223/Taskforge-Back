import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type NotificationDocument = HydratedDocument<Notification>;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'notifications' })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  /** e.g. `task.assigned`, `task.mentioned`, `comment.created`, `approval.requested` */
  @Prop({ required: true })
  type!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ type: String, default: null })
  body!: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  actorUserId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Project', default: null })
  projectId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Task', default: null })
  taskId!: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  entityType!: string | null;

  @Prop({ type: String, default: null })
  entityId!: string | null;

  @Prop({ type: Date, default: null })
  readAt!: Date | null;

  createdAt!: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, createdAt: -1 });
