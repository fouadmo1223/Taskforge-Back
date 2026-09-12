import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { ShareResourceType } from '@flowdesk/types';
import { randomToken } from '../../common/crypto/tokens.js';
import { ApiException } from '../../common/http/api-exception.js';
import { BoardColumn, type BoardColumnDocument } from '../columns/schemas/board-column.schema.js';
import { Project, type ProjectDocument } from '../projects/schemas/project.schema.js';
import { Task, type TaskDocument } from '../tasks/schemas/task.schema.js';
import { DashboardsService } from '../dashboards/dashboards.service.js';
import { ShareLink, type ShareLinkDocument } from './schemas/share-link.schema.js';

export interface ShareLinkView {
  id: string;
  resourceType: ShareResourceType;
  resourceId: string;
  token: string;
  url: string;
  expiresAt: string | null;
  revoked: boolean;
  viewCount: number;
  createdAt: string;
}

@Injectable()
export class SharingService {
  constructor(
    @InjectModel(ShareLink.name) private readonly model: Model<ShareLinkDocument>,
    @InjectModel(Project.name) private readonly projects: Model<ProjectDocument>,
    @InjectModel(Task.name) private readonly tasks: Model<TaskDocument>,
    @InjectModel(BoardColumn.name) private readonly columns: Model<BoardColumnDocument>,
    private readonly dashboards: DashboardsService,
  ) {}

  listForResource(workspaceId: string, resourceType: ShareResourceType, resourceId: string): Promise<ShareLinkDocument[]> {
    return this.model
      .find({
        workspaceId: new Types.ObjectId(workspaceId),
        resourceType,
        resourceId: new Types.ObjectId(resourceId),
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  async create(
    workspaceId: string,
    userId: string,
    input: { resourceType: ShareResourceType; resourceId: string; expiresInDays?: number | null },
  ): Promise<ShareLinkDocument> {
    if (input.resourceType === 'project') {
      const exists = await this.projects.exists({ _id: input.resourceId, workspaceId: new Types.ObjectId(workspaceId), deletedAt: null });
      if (!exists) throw ApiException.notFound('Project');
    }
    return this.model.create({
      workspaceId: new Types.ObjectId(workspaceId),
      resourceType: input.resourceType,
      resourceId: new Types.ObjectId(input.resourceId),
      token: `shr_${randomToken(18)}`,
      expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null,
      createdByUserId: new Types.ObjectId(userId),
    });
  }

  async revoke(workspaceId: string, id: string): Promise<void> {
    const res = await this.model.updateOne(
      { _id: id, workspaceId: new Types.ObjectId(workspaceId), revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    if (res.matchedCount === 0) throw ApiException.notFound('Share link');
  }

  // ── public resolution ───────────────────────────────────────────────────

  async resolve(token: string): Promise<{ resourceType: ShareResourceType; snapshot: unknown }> {
    const link = await this.model.findOne({ token }).exec();
    if (!link || link.revokedAt) throw ApiException.notFound('Shared link');
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) throw ApiException.notFound('Shared link');
    void this.model.updateOne({ _id: link._id }, { $inc: { viewCount: 1 } }).catch(() => undefined);

    if (link.resourceType === 'project') {
      return { resourceType: 'project', snapshot: await this.projectSnapshot(link.resourceId) };
    }
    return {
      resourceType: 'dashboard',
      snapshot: await this.dashboards.render(link.workspaceId.toString(), link.resourceId.toString()),
    };
  }

  private async projectSnapshot(projectId: Types.ObjectId): Promise<unknown> {
    const project = await this.projects.findById(projectId).select('key name description status color').lean();
    if (!project) throw ApiException.notFound('Project');
    const [cols, tasks] = await Promise.all([
      this.columns.find({ projectId }).select('name statusCategory rank').sort({ rank: 1 }).lean(),
      this.tasks
        .find({ projectId, deletedAt: null, archivedAt: null, parentTaskId: null })
        .select('key title priority columnId dueDate rank')
        .sort({ rank: 1 })
        .lean(),
    ]);
    return {
      project: { key: project.key, name: project.name, description: project.description, status: project.status, color: project.color },
      columns: cols.map((c) => ({ id: c._id.toString(), name: c.name, statusCategory: c.statusCategory })),
      tasks: tasks.map((t) => ({
        key: t.key,
        title: t.title,
        priority: t.priority,
        columnId: t.columnId.toString(),
        dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
      })),
    };
  }

  toView(l: ShareLinkDocument, baseUrl: string): ShareLinkView {
    return {
      id: l.id,
      resourceType: l.resourceType,
      resourceId: l.resourceId.toString(),
      token: l.token,
      url: `${baseUrl}/share/${l.token}`,
      expiresAt: l.expiresAt?.toISOString() ?? null,
      revoked: l.revokedAt !== null,
      viewCount: l.viewCount,
      createdAt: l.createdAt.toISOString(),
    };
  }
}
