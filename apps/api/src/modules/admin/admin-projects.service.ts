import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { OffsetPage } from '@flowdesk/types';
import { offsetPage } from '../../common/db/pagination.js';
import { ApiException } from '../../common/http/api-exception.js';
import { Project, type ProjectDocument } from '../projects/schemas/project.schema.js';
import { Workspace, type WorkspaceDocument } from '../workspaces/schemas/workspace.schema.js';
import { Task, type TaskDocument } from '../tasks/schemas/task.schema.js';
import { Board, type BoardDocument } from '../boards/schemas/board.schema.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { AdminListProjectsQueryDto } from './dto/admin.dto.js';

export interface AdminProjectListItem {
  id: string;
  key: string;
  name: string;
  status: string;
  visibility: string;
  workspaceId: string;
  workspaceName: string | null;
  memberCount: number;
  taskCount: number;
  archived: boolean;
  createdAt: string;
}

export interface AdminProjectDetail extends AdminProjectListItem {
  description: string;
  boardCount: number;
  completedTaskCount: number;
}

@Injectable()
export class AdminProjectsService {
  constructor(
    @InjectModel(Project.name) private readonly projects: Model<ProjectDocument>,
    @InjectModel(Workspace.name) private readonly workspaces: Model<WorkspaceDocument>,
    @InjectModel(Task.name) private readonly tasks: Model<TaskDocument>,
    @InjectModel(Board.name) private readonly boards: Model<BoardDocument>,
    private readonly projectsService: ProjectsService,
  ) {}

  async list(query: AdminListProjectsQueryDto): Promise<OffsetPage<AdminProjectListItem>> {
    const filter: Record<string, unknown> = { deletedAt: null };
    if (query.search?.trim()) {
      const re = new RegExp(query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: re }, { key: re }];
    }
    if (query.status) filter.status = query.status;
    if (query.visibility) filter.visibility = query.visibility;
    if (query.workspaceId) filter.workspaceId = new Types.ObjectId(query.workspaceId);

    const sortField = query.sort && ['name', 'createdAt', 'status'].includes(query.sort) ? query.sort : 'createdAt';
    const sort: Record<string, 1 | -1> = { [sortField]: query.order === 'asc' ? 1 : -1 };

    const [rows, total] = await Promise.all([
      this.projects
        .find(filter)
        .sort(sort)
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .exec(),
      this.projects.countDocuments(filter),
    ]);

    const workspaceIds = [...new Set(rows.map((r) => r.workspaceId.toString()))].map((id) => new Types.ObjectId(id));
    const workspaces = await this.workspaces.find({ _id: { $in: workspaceIds } }).select('name').exec();
    const wsById = new Map(workspaces.map((w) => [w.id, w.name]));

    const taskCounts = await Promise.all(rows.map((r) => this.tasks.countDocuments({ projectId: r._id, deletedAt: null })));

    const items = rows.map((r, i) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      status: r.status,
      visibility: r.visibility,
      workspaceId: r.workspaceId.toString(),
      workspaceName: wsById.get(r.workspaceId.toString()) ?? null,
      memberCount: r.memberUserIds.length,
      taskCount: taskCounts[i] ?? 0,
      archived: r.archivedAt !== null,
      createdAt: r.createdAt.toISOString(),
    }));
    return offsetPage(items, total, query.page, query.pageSize);
  }

  async getById(id: string): Promise<AdminProjectDetail> {
    if (!Types.ObjectId.isValid(id)) throw ApiException.notFound('Project');
    const project = await this.projects.findOne({ _id: id, deletedAt: null }).exec();
    if (!project) throw ApiException.notFound('Project');
    const workspace = await this.workspaces.findById(project.workspaceId).select('name').exec();
    const [taskCount, completedTaskCount, boardCount] = await Promise.all([
      this.tasks.countDocuments({ projectId: project._id, deletedAt: null }),
      this.tasks.countDocuments({ projectId: project._id, deletedAt: null, completedAt: { $ne: null } }),
      this.boards.countDocuments({ projectId: project._id, archivedAt: null }),
    ]);
    return {
      id: project.id,
      key: project.key,
      name: project.name,
      description: project.description,
      status: project.status,
      visibility: project.visibility,
      workspaceId: project.workspaceId.toString(),
      workspaceName: workspace?.name ?? null,
      memberCount: project.memberUserIds.length,
      taskCount,
      completedTaskCount,
      boardCount,
      archived: project.archivedAt !== null,
      createdAt: project.createdAt.toISOString(),
    };
  }

  async archive(id: string, archived: boolean): Promise<AdminProjectDetail> {
    const project = await this.projects.findOne({ _id: id, deletedAt: null }).exec();
    if (!project) throw ApiException.notFound('Project');
    await this.projectsService.setArchived(project.workspaceId.toString(), id, archived);
    return this.getById(id);
  }
}
