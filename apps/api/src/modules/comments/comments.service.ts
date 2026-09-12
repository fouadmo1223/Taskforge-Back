import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { CommentVisibility } from '@flowdesk/types';
import { ApiException } from '../../common/http/api-exception.js';
import { TasksService } from '../tasks/tasks.service.js';
import { Comment, type CommentDocument } from './schemas/comment.schema.js';

export interface CommentView {
  id: string;
  taskId: string;
  authorUserId: string;
  bodyHtml: string;
  visibility: CommentVisibility;
  mentionUserIds: string[];
  edited: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Strips tags to a plain-text projection (server-side, defensive). */
function toText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000);
}

@Injectable()
export class CommentsService {
  constructor(
    @InjectModel(Comment.name) private readonly model: Model<CommentDocument>,
    private readonly tasks: TasksService,
  ) {}

  async listForTask(
    workspaceId: string,
    taskId: string,
    opts: { internalAllowed: boolean },
  ): Promise<CommentDocument[]> {
    const filter: Record<string, unknown> = {
      workspaceId: new Types.ObjectId(workspaceId),
      taskId: new Types.ObjectId(taskId),
      deletedAt: null,
    };
    if (!opts.internalAllowed) filter.visibility = 'external';
    return this.model.find(filter).sort({ createdAt: 1 }).exec();
  }

  async create(
    workspaceId: string,
    userId: string,
    taskId: string,
    input: { bodyHtml: string; visibility: CommentVisibility; mentionUserIds?: string[] },
  ): Promise<{ comment: CommentDocument; task: Awaited<ReturnType<TasksService['getOrThrow']>> }> {
    const task = await this.tasks.getOrThrow(workspaceId, taskId);
    const body = input.bodyHtml.trim();
    if (!body || body === '<p></p>') throw ApiException.validation('Comment cannot be empty.');

    const comment = await this.model.create({
      workspaceId: new Types.ObjectId(workspaceId),
      projectId: task.projectId,
      taskId: task._id,
      authorUserId: new Types.ObjectId(userId),
      bodyHtml: body,
      bodyText: toText(body),
      visibility: input.visibility,
      mentionUserIds: [...new Set(input.mentionUserIds ?? [])].map((id) => new Types.ObjectId(id)),
    });
    await this.tasks.bumpCounter(taskId, 'commentCount', 1);
    return { comment, task };
  }

  async update(
    workspaceId: string,
    userId: string,
    commentId: string,
    bodyHtml: string,
    canModerate: boolean,
  ): Promise<CommentDocument> {
    const comment = await this.getOrThrow(workspaceId, commentId);
    if (comment.authorUserId.toString() !== userId && !canModerate) {
      throw ApiException.forbidden('Only the author can edit this comment.');
    }
    const body = bodyHtml.trim();
    if (!body || body === '<p></p>') throw ApiException.validation('Comment cannot be empty.');
    comment.bodyHtml = body;
    comment.bodyText = toText(body);
    comment.editedAt = new Date();
    await comment.save();
    return comment;
  }

  async remove(workspaceId: string, userId: string, commentId: string, canModerate: boolean): Promise<CommentDocument> {
    const comment = await this.getOrThrow(workspaceId, commentId);
    if (comment.authorUserId.toString() !== userId && !canModerate) {
      throw ApiException.forbidden('Only the author can delete this comment.');
    }
    comment.deletedAt = new Date();
    await comment.save();
    await this.tasks.bumpCounter(comment.taskId.toString(), 'commentCount', -1);
    return comment;
  }

  private async getOrThrow(workspaceId: string, commentId: string): Promise<CommentDocument> {
    const comment = await this.model
      .findOne({ _id: commentId, workspaceId: new Types.ObjectId(workspaceId), deletedAt: null })
      .exec();
    if (!comment) throw ApiException.notFound('Comment');
    return comment;
  }

  toView(c: CommentDocument): CommentView {
    return {
      id: c.id,
      taskId: c.taskId.toString(),
      authorUserId: c.authorUserId.toString(),
      bodyHtml: c.bodyHtml,
      visibility: c.visibility,
      mentionUserIds: c.mentionUserIds.map((id) => id.toString()),
      edited: c.editedAt !== null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}
