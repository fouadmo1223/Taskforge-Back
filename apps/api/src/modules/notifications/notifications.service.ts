import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { CursorPage } from '@flowdesk/types';
import { cursor, cursorPage } from '../../common/db/pagination.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { Notification, type NotificationDocument } from './schemas/notification.schema.js';

export interface NotifyInput {
  workspaceId: string;
  type: string;
  title: string;
  body?: string | null;
  actorUserId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  projectId: string | null;
  taskId: string | null;
  entityType: string | null;
  entityId: string | null;
  actor: { id: string; name: string } | null;
  createdAt: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('NotificationsService');

  constructor(
    @InjectModel(Notification.name) private readonly model: Model<NotificationDocument>,
    private readonly realtime: RealtimeService,
  ) {}

  /** Create one notification per recipient (self is skipped) and push it live. */
  async notify(recipientUserIds: string[], input: NotifyInput): Promise<void> {
    const unique = [...new Set(recipientUserIds.filter((id) => id && id !== input.actorUserId))];
    if (unique.length === 0) return;

    const docs = unique.map((userId) => ({
      workspaceId: new Types.ObjectId(input.workspaceId),
      userId: new Types.ObjectId(userId),
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      actorUserId: input.actorUserId ? new Types.ObjectId(input.actorUserId) : null,
      projectId: input.projectId ? new Types.ObjectId(input.projectId) : null,
      taskId: input.taskId ? new Types.ObjectId(input.taskId) : null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    }));

    try {
      const created = await this.model.insertMany(docs);
      for (const doc of created) {
        this.realtime.emitToUser(doc.userId.toString(), 'notification.created', this.toView(doc), input.actorUserId ?? null);
      }
    } catch (err) {
      this.logger.error(`notify failed: ${String(err)}`);
    }
  }

  async list(userId: string, page: { cursor?: string; limit?: number; unreadOnly?: boolean }): Promise<CursorPage<NotificationView>> {
    const limit = Math.min(page.limit ?? 20, 100);
    const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
    if (page.unreadOnly) filter.readAt = null;
    Object.assign(filter, cursor.idFilter(cursor.decode(page.cursor), 'desc'));
    const rows = await this.model
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .populate('actorUserId', 'name')
      .exec();
    return cursorPage(rows.map((r) => this.toView(r)), limit);
  }

  unreadCount(userId: string): Promise<number> {
    return this.model.countDocuments({ userId: new Types.ObjectId(userId), readAt: null });
  }

  async markRead(userId: string, ids: string[]): Promise<void> {
    await this.model
      .updateMany(
        { userId: new Types.ObjectId(userId), _id: { $in: ids.map((id) => new Types.ObjectId(id)) }, readAt: null },
        { $set: { readAt: new Date() } },
      )
      .exec();
  }

  async markAllRead(userId: string): Promise<void> {
    await this.model.updateMany({ userId: new Types.ObjectId(userId), readAt: null }, { $set: { readAt: new Date() } }).exec();
  }

  private toView(doc: NotificationDocument): NotificationView {
    const actor =
      doc.actorUserId && typeof doc.actorUserId === 'object' && 'name' in doc.actorUserId
        ? { id: String((doc.actorUserId as unknown as { _id: unknown })._id), name: (doc.actorUserId as unknown as { name: string }).name }
        : null;
    return {
      id: doc.id,
      type: doc.type,
      title: doc.title,
      body: doc.body,
      read: doc.readAt !== null,
      projectId: doc.projectId?.toString() ?? null,
      taskId: doc.taskId?.toString() ?? null,
      entityType: doc.entityType,
      entityId: doc.entityId,
      actor,
      createdAt: doc.createdAt.toISOString(),
    };
  }
}
