import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ApiException } from '../../common/http/api-exception.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { Task, type TaskDocument } from '../tasks/schemas/task.schema.js';
import { BoardColumn, type BoardColumnDocument } from '../columns/schemas/board-column.schema.js';
import { Project, type ProjectDocument } from '../projects/schemas/project.schema.js';
import { Portfolio, type PortfolioDocument } from './schemas/portfolio.schema.js';

export interface PortfolioView {
  id: string;
  name: string;
  description: string;
  color: string;
  projectIds: string[];
  ownerUserId: string | null;
  archived: boolean;
  createdAt: string;
}

export interface PortfolioRollup extends PortfolioView {
  projects: Array<{
    id: string;
    key: string;
    name: string;
    status: string;
    openTasks: number;
    totalTasks: number;
    doneRatio: number;
  }>;
  totals: { projects: number; openTasks: number; totalTasks: number; doneRatio: number };
}

@Injectable()
export class PortfoliosService {
  constructor(
    @InjectModel(Portfolio.name) private readonly model: Model<PortfolioDocument>,
    @InjectModel(Project.name) private readonly projects: Model<ProjectDocument>,
    @InjectModel(Task.name) private readonly tasks: Model<TaskDocument>,
    @InjectModel(BoardColumn.name) private readonly columns: Model<BoardColumnDocument>,
    private readonly realtime: RealtimeService,
  ) {}

  list(workspaceId: string, includeArchived = false): Promise<PortfolioDocument[]> {
    const filter: Record<string, unknown> = { workspaceId: new Types.ObjectId(workspaceId) };
    if (!includeArchived) filter.archivedAt = null;
    return this.model.find(filter).sort({ name: 1 }).exec();
  }

  async getOrThrow(workspaceId: string, id: string): Promise<PortfolioDocument> {
    const doc = await this.model.findOne({ _id: id, workspaceId: new Types.ObjectId(workspaceId) }).exec();
    if (!doc) throw ApiException.notFound('Portfolio');
    return doc;
  }

  async create(
    workspaceId: string,
    userId: string,
    input: { name: string; description?: string; color?: string; projectIds?: string[]; ownerUserId?: string | null },
  ): Promise<PortfolioDocument> {
    const doc = await this.model.create({
      workspaceId: new Types.ObjectId(workspaceId),
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      color: input.color ?? '#6366f1',
      projectIds: [...new Set(input.projectIds ?? [])].map((id) => new Types.ObjectId(id)),
      ownerUserId: input.ownerUserId ? new Types.ObjectId(input.ownerUserId) : null,
      createdByUserId: new Types.ObjectId(userId),
    });
    this.emit(workspaceId, doc, userId);
    return doc;
  }

  async update(
    workspaceId: string,
    id: string,
    userId: string,
    patch: Partial<{ name: string; description: string; color: string; projectIds: string[]; ownerUserId: string | null; archived: boolean }>,
  ): Promise<PortfolioDocument> {
    const doc = await this.getOrThrow(workspaceId, id);
    if (patch.name !== undefined) doc.name = patch.name.trim();
    if (patch.description !== undefined) doc.description = patch.description.trim();
    if (patch.color !== undefined) doc.color = patch.color;
    if (patch.projectIds !== undefined) doc.projectIds = [...new Set(patch.projectIds)].map((x) => new Types.ObjectId(x));
    if (patch.ownerUserId !== undefined) doc.ownerUserId = patch.ownerUserId ? new Types.ObjectId(patch.ownerUserId) : null;
    if (patch.archived !== undefined) doc.archivedAt = patch.archived ? new Date() : null;
    await doc.save();
    this.emit(workspaceId, doc, userId);
    return doc;
  }

  async remove(workspaceId: string, id: string, userId: string): Promise<void> {
    const doc = await this.getOrThrow(workspaceId, id);
    await this.model.deleteOne({ _id: doc._id });
    this.realtime.emitToWorkspace(workspaceId, 'portfolio.updated', { portfolioId: id, deleted: true }, userId);
  }

  async rollup(workspaceId: string, id: string): Promise<PortfolioRollup> {
    const portfolio = await this.getOrThrow(workspaceId, id);
    const projectIds = portfolio.projectIds;
    const projects = await this.projects
      .find({ _id: { $in: projectIds }, workspaceId: new Types.ObjectId(workspaceId), deletedAt: null })
      .select('key name status')
      .lean();

    const doneColumns = new Set(
      (await this.columns.find({ projectId: { $in: projectIds }, statusCategory: { $in: ['done', 'cancelled'] } }).select('_id').lean()).map(
        (c) => c._id.toString(),
      ),
    );

    const rows = await Promise.all(
      projects.map(async (p) => {
        const tasks = await this.tasks
          .find({ projectId: p._id, deletedAt: null, archivedAt: null })
          .select('columnId')
          .lean();
        const total = tasks.length;
        const done = tasks.filter((t) => doneColumns.has(t.columnId.toString())).length;
        return {
          id: p._id.toString(),
          key: p.key,
          name: p.name,
          status: p.status,
          openTasks: total - done,
          totalTasks: total,
          doneRatio: total > 0 ? done / total : 0,
        };
      }),
    );

    const totalTasks = rows.reduce((a, r) => a + r.totalTasks, 0);
    const openTasks = rows.reduce((a, r) => a + r.openTasks, 0);
    return {
      ...this.toView(portfolio),
      projects: rows,
      totals: {
        projects: rows.length,
        openTasks,
        totalTasks,
        doneRatio: totalTasks > 0 ? (totalTasks - openTasks) / totalTasks : 0,
      },
    };
  }

  private emit(workspaceId: string, doc: PortfolioDocument, actorId: string): void {
    this.realtime.emitToWorkspace(workspaceId, 'portfolio.updated', { portfolio: this.toView(doc) }, actorId);
  }

  toView(p: PortfolioDocument): PortfolioView {
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      color: p.color,
      projectIds: p.projectIds.map((x) => x.toString()),
      ownerUserId: p.ownerUserId?.toString() ?? null,
      archived: p.archivedAt !== null,
      createdAt: p.createdAt.toISOString(),
    };
  }
}
