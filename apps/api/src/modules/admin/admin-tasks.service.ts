import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { OffsetPage } from '@flowdesk/types';
import { offsetPage } from '../../common/db/pagination.js';
import { ApiException } from '../../common/http/api-exception.js';
import { Task, type TaskDocument } from '../tasks/schemas/task.schema.js';
import { Project, type ProjectDocument } from '../projects/schemas/project.schema.js';
import { User, type UserDocument } from '../users/schemas/user.schema.js';
import type { AdminListTasksQueryDto } from './dto/admin.dto.js';

export interface AdminTaskListItem {
  id: string;
  key: string;
  title: string;
  priority: string;
  projectId: string;
  projectName: string | null;
  assigneeNames: string[];
  reporterName: string | null;
  completedAt: string | null;
  dueDate: string | null;
  createdAt: string;
}

export interface AdminTaskDetail extends AdminTaskListItem {
  description: string;
  commentCount: number;
  attachmentCount: number;
  subtaskCount: number;
  subtaskDoneCount: number;
}

@Injectable()
export class AdminTasksService {
  constructor(
    @InjectModel(Task.name) private readonly tasks: Model<TaskDocument>,
    @InjectModel(Project.name) private readonly projects: Model<ProjectDocument>,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
  ) {}

  async list(query: AdminListTasksQueryDto): Promise<OffsetPage<AdminTaskListItem>> {
    const filter: Record<string, unknown> = { deletedAt: null };
    if (query.search?.trim()) {
      const re = new RegExp(query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ title: re }, { key: re }];
    }
    if (query.priority) filter.priority = query.priority;
    if (query.completion === 'completed') filter.completedAt = { $ne: null };
    if (query.completion === 'open') filter.completedAt = null;
    if (query.projectId) filter.projectId = new Types.ObjectId(query.projectId);

    const sortField = query.sort && ['title', 'createdAt', 'dueDate', 'priority'].includes(query.sort) ? query.sort : 'createdAt';
    const sort: Record<string, 1 | -1> = { [sortField]: query.order === 'asc' ? 1 : -1 };

    const [rows, total] = await Promise.all([
      this.tasks
        .find(filter)
        .sort(sort)
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .exec(),
      this.tasks.countDocuments(filter),
    ]);

    const projectIds = [...new Set(rows.map((r) => r.projectId.toString()))].map((id) => new Types.ObjectId(id));
    const userIds = [
      ...new Set([...rows.flatMap((r) => r.assigneeUserIds.map((id) => id.toString())), ...rows.map((r) => r.reporterUserId.toString())]),
    ].map((id) => new Types.ObjectId(id));

    const [projects, users] = await Promise.all([
      this.projects.find({ _id: { $in: projectIds } }).select('name').exec(),
      this.users.find({ _id: { $in: userIds } }).select('name').exec(),
    ]);
    const projectById = new Map(projects.map((p) => [p.id, p.name]));
    const userById = new Map(users.map((u) => [u.id, u.name]));

    const items = rows.map((r) => ({
      id: r.id,
      key: r.key,
      title: r.title,
      priority: r.priority,
      projectId: r.projectId.toString(),
      projectName: projectById.get(r.projectId.toString()) ?? null,
      assigneeNames: r.assigneeUserIds.map((id) => userById.get(id.toString())).filter((n): n is string => Boolean(n)),
      reporterName: userById.get(r.reporterUserId.toString()) ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
      dueDate: r.dueDate?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
    return offsetPage(items, total, query.page, query.pageSize);
  }

  async getById(id: string): Promise<AdminTaskDetail> {
    if (!Types.ObjectId.isValid(id)) throw ApiException.notFound('Task');
    const task = await this.tasks.findOne({ _id: id, deletedAt: null }).exec();
    if (!task) throw ApiException.notFound('Task');

    const userIds = [...new Set([...task.assigneeUserIds.map((i) => i.toString()), task.reporterUserId.toString()])].map(
      (id) => new Types.ObjectId(id),
    );
    const [project, users] = await Promise.all([
      this.projects.findById(task.projectId).select('name').exec(),
      this.users.find({ _id: { $in: userIds } }).select('name').exec(),
    ]);
    const userById = new Map(users.map((u) => [u.id, u.name]));

    return {
      id: task.id,
      key: task.key,
      title: task.title,
      description: task.description,
      priority: task.priority,
      projectId: task.projectId.toString(),
      projectName: project?.name ?? null,
      assigneeNames: task.assigneeUserIds.map((i) => userById.get(i.toString())).filter((n): n is string => Boolean(n)),
      reporterName: userById.get(task.reporterUserId.toString()) ?? null,
      completedAt: task.completedAt?.toISOString() ?? null,
      dueDate: task.dueDate?.toISOString() ?? null,
      commentCount: task.commentCount,
      attachmentCount: task.attachmentCount,
      subtaskCount: task.subtaskCount,
      subtaskDoneCount: task.subtaskDoneCount,
      createdAt: task.createdAt.toISOString(),
    };
  }
}
