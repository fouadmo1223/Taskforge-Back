import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { DependencyType } from '@flowdesk/types';
import { buildAdjacency, descendants, wouldCreateCycle } from '@flowdesk/utils';
import { ApiException } from '../../common/http/api-exception.js';
import { Task, type TaskDocument } from '../tasks/schemas/task.schema.js';
import { TaskDependency, type TaskDependencyDocument } from './schemas/task-dependency.schema.js';

/** Scheduling relationships: `predecessor -> successor` in the schedule DAG. */
const SCHEDULING = new Set<DependencyType>(['blocks', 'blocked_by', 'starts_after', 'finishes_before']);

export interface DependencyView {
  id: string;
  type: DependencyType;
  fromTaskId: string;
  toTaskId: string;
  createdAt: string;
}

export interface ScheduleImpactRow {
  taskId: string;
  key: string;
  title: string;
  currentStart: string | null;
  currentDue: string | null;
  proposedStart: string;
  proposedDue: string;
  shiftDays: number;
}

/** Normalise a dependency to a directed edge `predecessorId -> successorId`. */
function schedulingEdge(dep: { fromTaskId: string; toTaskId: string; type: DependencyType }): [string, string] | null {
  switch (dep.type) {
    case 'blocks':
    case 'finishes_before':
      return [dep.fromTaskId, dep.toTaskId];
    case 'blocked_by':
    case 'starts_after':
      return [dep.toTaskId, dep.fromTaskId];
    default:
      return null;
  }
}

const DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class DependenciesService {
  constructor(
    @InjectModel(TaskDependency.name) private readonly model: Model<TaskDependencyDocument>,
    @InjectModel(Task.name) private readonly tasks: Model<TaskDocument>,
  ) {}

  listForTask(taskId: string): Promise<TaskDependencyDocument[]> {
    const id = new Types.ObjectId(taskId);
    return this.model.find({ $or: [{ fromTaskId: id }, { toTaskId: id }] }).sort({ createdAt: 1 }).exec();
  }

  listForProject(projectId: string): Promise<TaskDependencyDocument[]> {
    return this.model.find({ projectId: new Types.ObjectId(projectId) }).exec();
  }

  async create(
    workspaceId: string,
    userId: string,
    fromTaskId: string,
    toTaskId: string,
    type: DependencyType,
  ): Promise<TaskDependencyDocument> {
    if (fromTaskId === toTaskId) throw ApiException.validation('A task cannot depend on itself.');

    const [from, to] = await Promise.all([
      this.tasks.findOne({ _id: fromTaskId, workspaceId: new Types.ObjectId(workspaceId), deletedAt: null }).select('projectId key').lean(),
      this.tasks.findOne({ _id: toTaskId, workspaceId: new Types.ObjectId(workspaceId), deletedAt: null }).select('projectId key').lean(),
    ]);
    if (!from || !to) throw ApiException.notFound('Task');
    if (from.projectId.toString() !== to.projectId.toString()) {
      throw ApiException.validation('Dependencies must be between tasks in the same project.');
    }

    if (SCHEDULING.has(type)) {
      const edges = await this.schedulingEdges(from.projectId.toString());
      const newEdge = schedulingEdge({ fromTaskId, toTaskId, type });
      if (newEdge) {
        const adj = buildAdjacency(edges);
        if (wouldCreateCycle(adj, newEdge[0], newEdge[1])) {
          throw ApiException.validation('That dependency would create a circular chain.');
        }
      }
    }

    try {
      return await this.model.create({
        workspaceId: new Types.ObjectId(workspaceId),
        projectId: from.projectId,
        fromTaskId: new Types.ObjectId(fromTaskId),
        toTaskId: new Types.ObjectId(toTaskId),
        type,
        createdByUserId: new Types.ObjectId(userId),
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw ApiException.conflict('That dependency already exists.');
      throw err;
    }
  }

  async remove(workspaceId: string, dependencyId: string): Promise<TaskDependencyDocument> {
    const dep = await this.model.findOne({ _id: dependencyId, workspaceId: new Types.ObjectId(workspaceId) }).exec();
    if (!dep) throw ApiException.notFound('Dependency');
    await this.model.deleteOne({ _id: dep._id });
    return dep;
  }

  /**
   * When `movedTaskId` now finishes at `newFinish`, compute the downstream tasks
   * whose schedule is violated and a proposed shift for each. Nothing is written.
   */
  async scheduleImpact(workspaceId: string, movedTaskId: string, newFinish: Date): Promise<ScheduleImpactRow[]> {
    const moved = await this.tasks.findOne({ _id: movedTaskId, workspaceId: new Types.ObjectId(workspaceId), deletedAt: null }).lean();
    if (!moved) throw ApiException.notFound('Task');

    const edges = await this.schedulingEdges(moved.projectId.toString());
    const adj = buildAdjacency(edges);
    const affectedIds = descendants(adj, movedTaskId);
    if (affectedIds.length === 0) return [];

    const tasks = await this.tasks
      .find({ _id: { $in: affectedIds.map((id) => new Types.ObjectId(id)) }, deletedAt: null })
      .select('key title startDate dueDate')
      .lean();
    const byId = new Map(tasks.map((t) => [t._id.toString(), t]));

    // topological-ish walk: propagate the earliest-allowed start from movedTask.
    const earliestStart = new Map<string, number>();
    earliestStart.set(movedTaskId, newFinish.getTime());

    const rows: ScheduleImpactRow[] = [];
    // simple BFS relaxation (project graphs are small)
    const queue = [movedTaskId];
    const guard = new Set<string>();
    while (queue.length) {
      const cur = queue.shift()!;
      if (guard.has(cur)) continue;
      guard.add(cur);
      const curFinish = earliestStart.get(cur) ?? newFinish.getTime();
      for (const succ of adj.get(cur) ?? []) {
        const t = byId.get(succ);
        if (!t) continue;
        const requiredStart = curFinish + DAY;
        const currentStart = t.startDate ? new Date(t.startDate).getTime() : null;
        if (currentStart === null || currentStart < requiredStart) {
          const shiftDays = currentStart === null ? 0 : Math.ceil((requiredStart - currentStart) / DAY);
          const durationMs =
            t.startDate && t.dueDate ? new Date(t.dueDate).getTime() - new Date(t.startDate).getTime() : 0;
          const proposedStart = new Date(requiredStart);
          const proposedDue = new Date(requiredStart + durationMs);
          earliestStart.set(succ, proposedDue.getTime());
          rows.push({
            taskId: succ,
            key: t.key,
            title: t.title,
            currentStart: t.startDate ? new Date(t.startDate).toISOString() : null,
            currentDue: t.dueDate ? new Date(t.dueDate).toISOString() : null,
            proposedStart: proposedStart.toISOString(),
            proposedDue: proposedDue.toISOString(),
            shiftDays,
          });
          queue.push(succ);
        } else {
          earliestStart.set(succ, t.dueDate ? new Date(t.dueDate).getTime() : requiredStart);
          queue.push(succ);
        }
      }
    }
    return rows;
  }

  async applyScheduleShift(
    workspaceId: string,
    shifts: Array<{ taskId: string; startDate: string; dueDate: string }>,
  ): Promise<number> {
    if (shifts.length === 0) return 0;
    const ops = shifts.map((s) => ({
      updateOne: {
        filter: { _id: new Types.ObjectId(s.taskId), workspaceId: new Types.ObjectId(workspaceId), deletedAt: null },
        update: { $set: { startDate: new Date(s.startDate), dueDate: new Date(s.dueDate) } },
      },
    }));
    const res = await this.tasks.bulkWrite(ops);
    return res.modifiedCount ?? 0;
  }

  private async schedulingEdges(projectId: string): Promise<Array<[string, string]>> {
    const deps = await this.model
      .find({ projectId: new Types.ObjectId(projectId), type: { $in: [...SCHEDULING] } })
      .select('fromTaskId toTaskId type')
      .lean();
    const edges: Array<[string, string]> = [];
    for (const d of deps) {
      const e = schedulingEdge({ fromTaskId: d.fromTaskId.toString(), toTaskId: d.toTaskId.toString(), type: d.type });
      if (e) edges.push(e);
    }
    return edges;
  }

  toView(dep: TaskDependencyDocument): DependencyView {
    return {
      id: dep.id,
      type: dep.type,
      fromTaskId: dep.fromTaskId.toString(),
      toTaskId: dep.toTaskId.toString(),
      createdAt: dep.createdAt.toISOString(),
    };
  }
}
