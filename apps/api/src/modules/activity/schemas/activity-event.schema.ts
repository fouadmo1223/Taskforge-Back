import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ActivityEventDocument = HydratedDocument<ActivityEvent>;

/**
 * User-facing activity feed entry. Human-readable, denormalised for cheap
 * rendering. Distinct from the audit log (security-facing, with before/after).
 */
@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'activity_events' })
export class ActivityEvent {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', default: null, index: true })
  projectId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Task', default: null, index: true })
  taskId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  actorUserId!: Types.ObjectId;

  /** dot-separated verb, e.g. `task.created`, `task.moved`, `comment.added` */
  @Prop({ required: true })
  verb!: string;

  @Prop({ required: true })
  entityType!: string;

  @Prop({ type: String, default: null })
  entityId!: string | null;

  /** denormalised label so the feed renders without extra lookups */
  @Prop({ type: String, default: null })
  entityTitle!: string | null;

  @Prop({ type: Object, default: {} })
  meta!: Record<string, unknown>;

  createdAt!: Date;
}

export const ActivityEventSchema = SchemaFactory.createForClass(ActivityEvent);
ActivityEventSchema.index({ workspaceId: 1, createdAt: -1 });
ActivityEventSchema.index({ projectId: 1, createdAt: -1 });
ActivityEventSchema.index({ taskId: 1, createdAt: -1 });
