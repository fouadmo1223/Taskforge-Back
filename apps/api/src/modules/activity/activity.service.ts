import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { cursor, cursorPage } from '../../common/db/pagination.js';
import type { CursorPage } from '@flowdesk/types';
import { ActivityEvent, type ActivityEventDocument } from './schemas/activity-event.schema.js';

export interface ActivityInput {
  workspaceId: string;
  projectId?: string | null;
  taskId?: string | null;
  actorUserId: string;
  verb: string;
  entityType: string;
  entityId?: string | null;
  entityTitle?: string | null;
  meta?: Record<string, unknown>;
}

export interface ActivityView {
  id: string;
  verb: string;
  entityType: string;
  entityId: string | null;
  entityTitle: string | null;
  actor: { id: string; name: string } | null;
  meta: Record<string, unknown>;
  createdAt: string;
}

@Injectable()
export class ActivityService {
  private readonly logger = new Logger('ActivityService');

  constructor(@InjectModel(ActivityEvent.name) private readonly model: Model<ActivityEventDocument>) {}

  record(input: ActivityInput): void {
    this.model
      .create({
        workspaceId: new Types.ObjectId(input.workspaceId),
        projectId: input.projectId ? new Types.ObjectId(input.projectId) : null,
        taskId: input.taskId ? new Types.ObjectId(input.taskId) : null,
        actorUserId: new Types.ObjectId(input.actorUserId),
        verb: input.verb,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        entityTitle: input.entityTitle ?? null,
        meta: input.meta ?? {},
      })
      .catch((err: unknown) => this.logger.error(`activity write failed: ${String(err)}`));
  }

  async feed(
    scope: { workspaceId: string; projectId?: string; taskId?: string },
    page: { cursor?: string; limit?: number } = {},
  ): Promise<CursorPage<ActivityView>> {
    const limit = Math.min(page.limit ?? 30, 100);
    const filter: Record<string, unknown> = { workspaceId: new Types.ObjectId(scope.workspaceId) };
    if (scope.projectId) filter.projectId = new Types.ObjectId(scope.projectId);
    if (scope.taskId) filter.taskId = new Types.ObjectId(scope.taskId);
    Object.assign(filter, cursor.idFilter(cursor.decode(page.cursor), 'desc'));

    const rows = await this.model
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .populate('actorUserId', 'name')
      .exec();

    return cursorPage(rows.map((r) => this.toView(r)), limit);
  }

  private toView(row: ActivityEventDocument): ActivityView {
    const actor =
      row.actorUserId && typeof row.actorUserId === 'object' && 'name' in row.actorUserId
        ? {
            id: String((row.actorUserId as unknown as { _id: unknown })._id),
            name: (row.actorUserId as unknown as { name: string }).name,
          }
        : null;
    return {
      id: row.id,
      verb: row.verb,
      entityType: row.entityType,
      entityId: row.entityId,
      entityTitle: row.entityTitle,
      actor,
      meta: row.meta,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
