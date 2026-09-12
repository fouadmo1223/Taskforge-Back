import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { DependencyType, StatusCategory } from '@flowdesk/types';
import { ApiException } from '../../common/http/api-exception.js';
import { DependenciesService } from '../dependencies/dependencies.service.js';
import { MilestonesService, type MilestoneView } from '../milestones/milestones.service.js';
import { Task, type TaskDocument } from '../tasks/schemas/task.schema.js';
import { BoardColumn, type BoardColumnDocument } from '../columns/schemas/board-column.schema.js';
import { ProjectBaseline, type ProjectBaselineDocument } from './schemas/project-baseline.schema.js';

const DAY = 24 * 60 * 60 * 1000;

export interface TimelineTask {
  id: string;
  key: string;
  title: string;
  parentTaskId: string | null;
  depth: number;
  startDate: string | null;
  dueDate: string | null;
  statusCategory: StatusCategory;
  completedAt: string | null;
  milestoneId: string | null;
  assigneeUserIds: string[];
  critical: boolean;
  baseline: { startDate: string | null; dueDate: string | null } | null;
}

export interface TimelineResponse {
  tasks: TimelineTask[];
  dependencies: Array<{ id: string; type: DependencyType; fromTaskId: string; toTaskId: string }>;
  milestones: MilestoneView[];
  baseline: { id: string; name: string; createdAt: string } | null;
}

@Injectable()
export class PlanningService {
  constructor(
    @InjectModel(Task.name) private readonly tasks: Model<TaskDocument>,
    @InjectModel(BoardColumn.name) private readonly columns: Model<BoardColumnDocument>,
    @InjectModel(ProjectBaseline.name) private readonly baselines: Model<ProjectBaselineDocument>,
    private readonly deps: DependenciesService,
    private readonly milestones: MilestonesService,
  ) {}

  async timeline(workspaceId: string, projectId: string): Promise<TimelineResponse> {
    const wid = new Types.ObjectId(workspaceId);
    const pid = new Types.ObjectId(projectId);

    const [tasks, columns, dependencies, milestoneDocs, baseline] = await Promise.all([
      this.tasks.find({ workspaceId: wid, projectId: pid, deletedAt: null, archivedAt: null }).sort({ rank: 1 }).exec(),
      this.columns.find({ projectId: pid }).select('_id statusCategory').lean(),
      this.deps.listForProject(projectId),
      this.milestones.listForProject(projectId),
      this.baselines.findOne({ projectId: pid }).sort({ createdAt: -1 }).exec(),
    ]);

    const colCat = new Map(columns.map((c) => [c._id.toString(), c.statusCategory as StatusCategory]));
    const depEdges = dependencies
      .map((d) => this.scheduleEdge(d.fromTaskId.toString(), d.toTaskId.toString(), d.type))
      .filter((e): e is [string, string] => e !== null);

    const critical = this.criticalPath(tasks, depEdges);
    const baseMap = new Map<string, { startDate: string | null; dueDate: string | null }>();
    if (baseline) {
      for (const e of baseline.entries) {
        baseMap.set(e.taskId.toString(), {
          startDate: e.startDate ? e.startDate.toISOString() : null,
          dueDate: e.dueDate ? e.dueDate.toISOString() : null,
        });
      }
    }

    return {
      tasks: tasks.map((t) => ({
        id: t.id,
        key: t.key,
        title: t.title,
        parentTaskId: t.parentTaskId?.toString() ?? null,
        depth: t.depth,
        startDate: t.startDate?.toISOString() ?? null,
        dueDate: t.dueDate?.toISOString() ?? null,
        statusCategory: colCat.get(t.columnId.toString()) ?? 'todo',
        completedAt: t.completedAt?.toISOString() ?? null,
        milestoneId: t.milestoneId?.toString() ?? null,
        assigneeUserIds: t.assigneeUserIds.map((id) => id.toString()),
        critical: critical.has(t.id),
        baseline: baseMap.get(t.id) ?? null,
      })),
      dependencies: dependencies.map((d) => ({
        id: d.id,
        type: d.type,
        fromTaskId: d.fromTaskId.toString(),
        toTaskId: d.toTaskId.toString(),
      })),
      milestones: await Promise.all(milestoneDocs.map((m) => this.milestones.toView(m))),
      baseline: baseline ? { id: baseline.id, name: baseline.name, createdAt: baseline.createdAt.toISOString() } : null,
    };
  }

  async calendar(
    workspaceId: string,
    projectId: string,
    from: Date,
    to: Date,
  ): Promise<{ tasks: Array<{ id: string; key: string; title: string; dueDate: string; startDate: string | null; completedAt: string | null }>; milestones: MilestoneView[] }> {
    const wid = new Types.ObjectId(workspaceId);
    const pid = new Types.ObjectId(projectId);
    const [tasks, milestones] = await Promise.all([
      this.tasks
        .find({ workspaceId: wid, projectId: pid, deletedAt: null, dueDate: { $gte: from, $lte: to } })
        .select('key title startDate dueDate completedAt')
        .sort({ dueDate: 1 })
        .lean(),
      this.milestones.listForProject(projectId),
    ]);
    return {
      tasks: tasks.map((t) => ({
        id: t._id.toString(),
        key: t.key,
        title: t.title,
        dueDate: new Date(t.dueDate!).toISOString(),
        startDate: t.startDate ? new Date(t.startDate).toISOString() : null,
        completedAt: t.completedAt ? new Date(t.completedAt).toISOString() : null,
      })),
      milestones: (await Promise.all(milestones.map((m) => this.milestones.toView(m)))).filter(
        (m) => new Date(m.date) >= from && new Date(m.date) <= to,
      ),
    };
  }

  async createBaseline(workspaceId: string, projectId: string, userId: string, name: string): Promise<ProjectBaselineDocument> {
    const tasks = await this.tasks
      .find({ workspaceId: new Types.ObjectId(workspaceId), projectId: new Types.ObjectId(projectId), deletedAt: null })
      .select('_id startDate dueDate')
      .lean();
    return this.baselines.create({
      workspaceId: new Types.ObjectId(workspaceId),
      projectId: new Types.ObjectId(projectId),
      name: name.trim() || `Baseline ${new Date().toISOString().slice(0, 10)}`,
      createdByUserId: new Types.ObjectId(userId),
      entries: tasks.map((t) => ({ taskId: t._id, startDate: t.startDate ?? null, dueDate: t.dueDate ?? null })),
    });
  }

  async listBaselines(projectId: string): Promise<Array<{ id: string; name: string; createdAt: string; taskCount: number }>> {
    const rows = await this.baselines.find({ projectId: new Types.ObjectId(projectId) }).sort({ createdAt: -1 }).exec();
    return rows.map((b) => ({ id: b.id, name: b.name, createdAt: b.createdAt.toISOString(), taskCount: b.entries.length }));
  }

  async deleteBaseline(workspaceId: string, baselineId: string): Promise<void> {
    const res = await this.baselines.deleteOne({ _id: baselineId, workspaceId: new Types.ObjectId(workspaceId) });
    if (res.deletedCount === 0) throw ApiException.notFound('Baseline');
  }

  // ── internals ───────────────────────────────────────────────────────────

  private scheduleEdge(from: string, to: string, type: DependencyType): [string, string] | null {
    switch (type) {
      case 'blocks':
      case 'finishes_before':
        return [from, to];
      case 'blocked_by':
      case 'starts_after':
        return [to, from];
      default:
        return null;
    }
  }

  /** Marks tasks with zero slack on the schedule DAG (CPM). */
  private criticalPath(tasks: TaskDocument[], edges: Array<[string, string]>): Set<string> {
    const dur = new Map<string, number>();
    for (const t of tasks) {
      const d =
        t.startDate && t.dueDate ? Math.max(DAY, new Date(t.dueDate).getTime() - new Date(t.startDate).getTime()) : DAY;
      dur.set(t.id, d);
    }
    const succ = new Map<string, string[]>();
    const pred = new Map<string, string[]>();
    const indeg = new Map<string, number>();
    for (const id of dur.keys()) {
      indeg.set(id, 0);
      succ.set(id, []);
      pred.set(id, []);
    }
    for (const [a, b] of edges) {
      if (!dur.has(a) || !dur.has(b)) continue;
      succ.get(a)!.push(b);
      pred.get(b)!.push(a);
      indeg.set(b, (indeg.get(b) ?? 0) + 1);
    }

    // topo order
    const queue = [...indeg].filter(([, d]) => d === 0).map(([id]) => id);
    const order: string[] = [];
    const work = new Map(indeg);
    while (queue.length) {
      const n = queue.shift()!;
      order.push(n);
      for (const m of succ.get(n) ?? []) {
        work.set(m, (work.get(m) ?? 0) - 1);
        if (work.get(m) === 0) queue.push(m);
      }
    }
    if (order.length !== dur.size) return new Set(); // cycle — bail (shouldn't happen)

    const ef = new Map<string, number>(); // earliest finish
    for (const n of order) {
      const es = Math.max(0, ...(pred.get(n) ?? []).map((p) => ef.get(p) ?? 0));
      ef.set(n, es + (dur.get(n) ?? DAY));
    }
    const projectFinish = Math.max(0, ...ef.values());
    const lf = new Map<string, number>(); // latest finish
    for (const n of [...order].reverse()) {
      const succs = succ.get(n) ?? [];
      const lfn = succs.length
        ? Math.min(...succs.map((s) => (lf.get(s) ?? projectFinish) - (dur.get(s) ?? DAY)))
        : projectFinish;
      lf.set(n, lfn);
    }
    const critical = new Set<string>();
    for (const n of order) {
      if (Math.abs((lf.get(n) ?? 0) - (ef.get(n) ?? 0)) < 1000 && (edges.some(([a, b]) => a === n || b === n))) {
        critical.add(n);
      }
    }
    return critical;
  }
}
