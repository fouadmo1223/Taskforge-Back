import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { TaskPriority } from '@flowdesk/types';
import { Task, type TaskDocument } from '../tasks/schemas/task.schema.js';
import { Project, type ProjectDocument } from '../projects/schemas/project.schema.js';
import { BoardColumn, type BoardColumnDocument } from '../columns/schemas/board-column.schema.js';

export interface MyWorkItem {
  id: string;
  key: string;
  title: string;
  projectId: string;
  projectName: string;
  projectKey: string;
  columnName: string;
  priority: TaskPriority;
  dueDate: string | null;
  startDate: string | null;
  completedAt: string | null;
  relation: 'assignee' | 'reporter' | 'follower';
}

export interface MyWorkResponse {
  items: MyWorkItem[];
  stats: { assigned: number; overdue: number; dueToday: number; completedLast7d: number };
}

@Injectable()
export class MyWorkService {
  constructor(
    @InjectModel(Task.name) private readonly tasks: Model<TaskDocument>,
    @InjectModel(Project.name) private readonly projects: Model<ProjectDocument>,
    @InjectModel(BoardColumn.name) private readonly columns: Model<BoardColumnDocument>,
  ) {}

  async forUser(workspaceId: string, userId: string): Promise<MyWorkResponse> {
    const wid = new Types.ObjectId(workspaceId);
    const uid = new Types.ObjectId(userId);

    const tasks = await this.tasks
      .find({
        workspaceId: wid,
        deletedAt: null,
        archivedAt: null,
        $or: [{ assigneeUserIds: uid }, { reporterUserId: uid }, { followerUserIds: uid }],
      })
      .sort({ dueDate: 1, priority: -1 })
      .limit(500)
      .exec();

    if (tasks.length === 0) {
      return { items: [], stats: { assigned: 0, overdue: 0, dueToday: 0, completedLast7d: 0 } };
    }

    const projectIds = [...new Set(tasks.map((t) => t.projectId.toString()))];
    const columnIds = [...new Set(tasks.map((t) => t.columnId.toString()))];
    const [projects, cols] = await Promise.all([
      this.projects
        .find({ _id: { $in: projectIds.map((id) => new Types.ObjectId(id)) } })
        .select('name key')
        .lean(),
      this.columns
        .find({ _id: { $in: columnIds.map((id) => new Types.ObjectId(id)) } })
        .select('name')
        .lean(),
    ]);
    const projById = new Map(projects.map((p) => [p._id.toString(), p]));
    const colById = new Map(cols.map((c) => [c._id.toString(), c.name]));

    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setHours(23, 59, 59, 999);
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    let overdue = 0;
    let dueToday = 0;
    let assigned = 0;
    let completedLast7d = 0;

    const items: MyWorkItem[] = tasks.map((t) => {
      const isAssignee = t.assigneeUserIds.some((id) => id.toString() === userId);
      const isReporter = t.reporterUserId.toString() === userId;
      const relation: MyWorkItem['relation'] = isAssignee ? 'assignee' : isReporter ? 'reporter' : 'follower';
      if (isAssignee) assigned += 1;
      if (t.dueDate && !t.completedAt) {
        const d = t.dueDate.getTime();
        if (d < startOfToday.getTime()) overdue += 1;
        else if (d <= endOfToday.getTime()) dueToday += 1;
      }
      if (t.completedAt && t.completedAt.getTime() >= weekAgo) completedLast7d += 1;

      const proj = projById.get(t.projectId.toString());
      return {
        id: t.id,
        key: t.key,
        title: t.title,
        projectId: t.projectId.toString(),
        projectName: proj?.name ?? 'Project',
        projectKey: proj?.key ?? '',
        columnName: colById.get(t.columnId.toString()) ?? '',
        priority: t.priority,
        dueDate: t.dueDate?.toISOString() ?? null,
        startDate: t.startDate?.toISOString() ?? null,
        completedAt: t.completedAt?.toISOString() ?? null,
        relation,
      };
    });

    return { items, stats: { assigned, overdue, dueToday, completedLast7d } };
  }
}
