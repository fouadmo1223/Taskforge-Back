import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { StatusCategory } from '@flowdesk/types';
import { BoardColumn, type BoardColumnDocument } from '../columns/schemas/board-column.schema.js';
import { Project, type ProjectDocument } from '../projects/schemas/project.schema.js';
import { Task, type TaskDocument } from '../tasks/schemas/task.schema.js';

export interface ProjectStatusRow {
  projectId: string;
  key: string;
  name: string;
  status: string;
  byCategory: Record<StatusCategory, number>;
  total: number;
  overdue: number;
  completionRatio: number;
}

export interface ThroughputBucket {
  weekStart: string;
  created: number;
  completed: number;
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Project.name) private readonly projects: Model<ProjectDocument>,
    @InjectModel(Task.name) private readonly tasks: Model<TaskDocument>,
    @InjectModel(BoardColumn.name) private readonly columns: Model<BoardColumnDocument>,
  ) {}

  async projectStatus(workspaceId: string, projectIds?: string[]): Promise<ProjectStatusRow[]> {
    const filter: Record<string, unknown> = { workspaceId: new Types.ObjectId(workspaceId), deletedAt: null };
    if (projectIds?.length) filter._id = { $in: projectIds.map((id) => new Types.ObjectId(id)) };
    const projects = await this.projects.find(filter).select('key name status').lean();
    if (projects.length === 0) return [];

    const pIds = projects.map((p) => p._id);
    const cols = await this.columns.find({ projectId: { $in: pIds } }).select('projectId statusCategory').lean();
    const catByCol = new Map(cols.map((c) => [c._id.toString(), c.statusCategory as StatusCategory]));

    const tasks = await this.tasks
      .find({ projectId: { $in: pIds }, deletedAt: null, archivedAt: null })
      .select('projectId columnId dueDate')
      .lean();

    const now = Date.now();
    const rows = new Map<string, ProjectStatusRow>();
    for (const p of projects) {
      rows.set(p._id.toString(), {
        projectId: p._id.toString(),
        key: p.key,
        name: p.name,
        status: p.status,
        byCategory: { backlog: 0, todo: 0, in_progress: 0, blocked: 0, in_review: 0, done: 0, cancelled: 0 },
        total: 0,
        overdue: 0,
        completionRatio: 0,
      });
    }

    for (const t of tasks) {
      const row = rows.get(t.projectId.toString());
      if (!row) continue;
      const cat = catByCol.get(t.columnId.toString()) ?? 'todo';
      row.byCategory[cat] += 1;
      row.total += 1;
      const closed = cat === 'done' || cat === 'cancelled';
      if (!closed && t.dueDate && new Date(t.dueDate).getTime() < now) row.overdue += 1;
    }
    for (const row of rows.values()) {
      const done = row.byCategory.done + row.byCategory.cancelled;
      row.completionRatio = row.total > 0 ? done / row.total : 0;
    }
    return [...rows.values()];
  }

  async throughput(workspaceId: string, projectId: string | undefined, weeks: number): Promise<ThroughputBucket[]> {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - weeks * 7);

    const base: Record<string, unknown> = { workspaceId: new Types.ObjectId(workspaceId), deletedAt: null };
    if (projectId) base.projectId = new Types.ObjectId(projectId);

    const [created, completed] = await Promise.all([
      this.tasks.find({ ...base, createdAt: { $gte: since } }).select('createdAt').lean(),
      this.tasks.find({ ...base, completedAt: { $gte: since, $ne: null } }).select('completedAt').lean(),
    ]);

    const buckets = new Map<string, ThroughputBucket>();
    for (let i = 0; i < weeks; i += 1) {
      const d = new Date(since);
      d.setUTCDate(d.getUTCDate() + i * 7);
      buckets.set(d.toISOString().slice(0, 10), { weekStart: d.toISOString(), created: 0, completed: 0 });
    }
    const keyFor = (date: Date): string => {
      const diffWeeks = Math.floor((date.getTime() - since.getTime()) / (7 * 86_400_000));
      const d = new Date(since);
      d.setUTCDate(d.getUTCDate() + diffWeeks * 7);
      return d.toISOString().slice(0, 10);
    };
    for (const t of created) {
      const b = buckets.get(keyFor(new Date(t.createdAt as Date)));
      if (b) b.created += 1;
    }
    for (const t of completed) {
      const b = buckets.get(keyFor(new Date(t.completedAt as Date)));
      if (b) b.completed += 1;
    }
    return [...buckets.values()];
  }

  async priorityBreakdown(workspaceId: string, projectId?: string): Promise<Record<string, number>> {
    const match: Record<string, unknown> = { workspaceId: new Types.ObjectId(workspaceId), deletedAt: null, archivedAt: null };
    if (projectId) match.projectId = new Types.ObjectId(projectId);
    const rows = await this.tasks.aggregate<{ _id: string; n: number }>([
      { $match: match },
      { $group: { _id: '$priority', n: { $sum: 1 } } },
    ]);
    const out: Record<string, number> = { none: 0, low: 0, medium: 0, high: 0, urgent: 0 };
    for (const r of rows) out[r._id] = r.n;
    return out;
  }
}
