import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { SlaState, TaskPriority } from '@flowdesk/types';
import { ApiException } from '../../common/http/api-exception.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { BoardColumn, type BoardColumnDocument } from '../columns/schemas/board-column.schema.js';
import { Task, type TaskDocument } from '../tasks/schemas/task.schema.js';
import {
  SlaPolicy,
  SlaTracker,
  type SlaPolicyDocument,
  type SlaTrackerDocument,
} from './schemas/sla.schema.js';

const HOUR_MS = 3_600_000;
const RESOLVED_CATEGORIES = new Set(['done', 'cancelled']);
const UNSTARTED_CATEGORIES = new Set(['backlog', 'todo']);

export interface SlaPolicyView {
  id: string;
  name: string;
  active: boolean;
  appliesTo: { projectIds: string[]; priorities: TaskPriority[]; types: string[] };
  responseHours: number;
  resolutionHours: number;
  warnAtPercent: number;
  notifyUserIds: string[];
  escalateToUserIds: string[];
  createdAt: string;
}

export interface SlaTrackerView {
  id: string;
  taskId: string;
  taskKey: string;
  taskTitle: string;
  projectId: string;
  policyId: string;
  policyName: string;
  startedAt: string;
  responseDueAt: string;
  resolutionDueAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  state: SlaState;
  escalationLevel: number;
}

@Injectable()
export class SlaService {
  private readonly logger = new Logger('SlaService');

  constructor(
    @InjectModel(SlaPolicy.name) private readonly policies: Model<SlaPolicyDocument>,
    @InjectModel(SlaTracker.name) private readonly trackers: Model<SlaTrackerDocument>,
    @InjectModel(Task.name) private readonly tasks: Model<TaskDocument>,
    @InjectModel(BoardColumn.name) private readonly columns: Model<BoardColumnDocument>,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  // ── policies ────────────────────────────────────────────────────────────

  listPolicies(workspaceId: string): Promise<SlaPolicyDocument[]> {
    return this.policies.find({ workspaceId: new Types.ObjectId(workspaceId) }).sort({ createdAt: -1 }).exec();
  }

  async createPolicy(
    workspaceId: string,
    userId: string,
    input: {
      name: string;
      responseHours: number;
      resolutionHours: number;
      warnAtPercent?: number;
      appliesTo?: { projectIds?: string[]; priorities?: TaskPriority[]; types?: string[] };
      notifyUserIds?: string[];
      escalateToUserIds?: string[];
    },
  ): Promise<SlaPolicyDocument> {
    if (input.responseHours > input.resolutionHours) {
      throw ApiException.validation('Response target cannot exceed the resolution target.');
    }
    const doc = await this.policies.create({
      workspaceId: new Types.ObjectId(workspaceId),
      name: input.name.trim(),
      responseHours: input.responseHours,
      resolutionHours: input.resolutionHours,
      warnAtPercent: input.warnAtPercent ?? 80,
      appliesTo: {
        projectIds: (input.appliesTo?.projectIds ?? []).map((id) => new Types.ObjectId(id)),
        priorities: input.appliesTo?.priorities ?? [],
        types: input.appliesTo?.types ?? [],
      },
      notifyUserIds: (input.notifyUserIds ?? []).map((id) => new Types.ObjectId(id)),
      escalateToUserIds: (input.escalateToUserIds ?? []).map((id) => new Types.ObjectId(id)),
      createdByUserId: new Types.ObjectId(userId),
    });
    this.realtime.emitToWorkspace(workspaceId, 'sla.updated', { policy: this.policyView(doc) }, userId);
    return doc;
  }

  async updatePolicy(
    workspaceId: string,
    policyId: string,
    userId: string,
    patch: Partial<{
      name: string;
      active: boolean;
      responseHours: number;
      resolutionHours: number;
      warnAtPercent: number;
      appliesTo: { projectIds?: string[]; priorities?: TaskPriority[]; types?: string[] };
      notifyUserIds: string[];
      escalateToUserIds: string[];
    }>,
  ): Promise<SlaPolicyDocument> {
    const doc = await this.policies.findOne({ _id: policyId, workspaceId: new Types.ObjectId(workspaceId) }).exec();
    if (!doc) throw ApiException.notFound('SLA policy');
    if (patch.name !== undefined) doc.name = patch.name.trim();
    if (patch.active !== undefined) doc.active = patch.active;
    if (patch.responseHours !== undefined) doc.responseHours = patch.responseHours;
    if (patch.resolutionHours !== undefined) doc.resolutionHours = patch.resolutionHours;
    if (patch.warnAtPercent !== undefined) doc.warnAtPercent = patch.warnAtPercent;
    if (doc.responseHours > doc.resolutionHours) {
      throw ApiException.validation('Response target cannot exceed the resolution target.');
    }
    if (patch.appliesTo !== undefined) {
      doc.appliesTo = {
        projectIds: (patch.appliesTo.projectIds ?? []).map((id) => new Types.ObjectId(id)),
        priorities: patch.appliesTo.priorities ?? [],
        types: patch.appliesTo.types ?? [],
      } as SlaPolicyDocument['appliesTo'];
    }
    if (patch.notifyUserIds !== undefined) doc.notifyUserIds = patch.notifyUserIds.map((id) => new Types.ObjectId(id));
    if (patch.escalateToUserIds !== undefined) doc.escalateToUserIds = patch.escalateToUserIds.map((id) => new Types.ObjectId(id));
    await doc.save();
    this.realtime.emitToWorkspace(workspaceId, 'sla.updated', { policy: this.policyView(doc) }, userId);
    return doc;
  }

  async deletePolicy(workspaceId: string, policyId: string, userId: string): Promise<void> {
    const res = await this.policies.deleteOne({ _id: policyId, workspaceId: new Types.ObjectId(workspaceId) });
    if (res.deletedCount === 0) throw ApiException.notFound('SLA policy');
    await this.trackers.deleteMany({ policyId: new Types.ObjectId(policyId) });
    this.realtime.emitToWorkspace(workspaceId, 'sla.updated', { policyId, deleted: true }, userId);
  }

  // ── trackers + sweep ────────────────────────────────────────────────────

  async listTrackers(workspaceId: string, projectId?: string): Promise<SlaTrackerView[]> {
    const filter: Record<string, unknown> = { workspaceId: new Types.ObjectId(workspaceId) };
    if (projectId) filter.projectId = new Types.ObjectId(projectId);
    const rows = await this.trackers.find(filter).sort({ resolutionDueAt: 1 }).limit(1000).exec();
    if (rows.length === 0) return [];

    const [tasks, policies] = await Promise.all([
      this.tasks.find({ _id: { $in: rows.map((r) => r.taskId) } }).select('key title').lean(),
      this.policies.find({ _id: { $in: [...new Set(rows.map((r) => r.policyId.toString()))] } }).select('name').lean(),
    ]);
    const taskMap = new Map(tasks.map((t) => [t._id.toString(), t]));
    const policyMap = new Map(policies.map((p) => [p._id.toString(), p]));

    return rows.map((r) => {
      const t = taskMap.get(r.taskId.toString());
      return {
        id: r.id,
        taskId: r.taskId.toString(),
        taskKey: t?.key ?? '—',
        taskTitle: t?.title ?? '(deleted task)',
        projectId: r.projectId.toString(),
        policyId: r.policyId.toString(),
        policyName: policyMap.get(r.policyId.toString())?.name ?? '—',
        startedAt: r.startedAt.toISOString(),
        responseDueAt: r.responseDueAt.toISOString(),
        resolutionDueAt: r.resolutionDueAt.toISOString(),
        firstResponseAt: r.firstResponseAt?.toISOString() ?? null,
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
        state: r.state,
        escalationLevel: r.escalationLevel,
      };
    });
  }

  /**
   * Attaches trackers to newly-matching tasks, recomputes every open tracker
   * against the current clock, and fires escalation notifications on the
   * transitions into `warning` and `breached`. Pull-based: call from the SLA
   * page load and/or a scheduled trigger.
   */
  async sweep(workspaceId: string, actorId: string | null = null): Promise<{ evaluated: number; warned: number; breached: number; created: number }> {
    const wid = new Types.ObjectId(workspaceId);
    const now = new Date();
    const activePolicies = await this.policies.find({ workspaceId: wid, active: true }).exec();

    let created = 0;
    if (activePolicies.length > 0) {
      const tracked = new Set((await this.trackers.find({ workspaceId: wid }).select('taskId').lean()).map((t) => t.taskId.toString()));
      const openTasks = await this.tasks
        .find({ workspaceId: wid, deletedAt: null, archivedAt: null })
        .select('key title projectId columnId priority type createdAt')
        .lean();
      const catByColumn = await this.columnCategoryMap(openTasks.map((t) => t.columnId));

      for (const task of openTasks) {
        if (tracked.has(task._id.toString())) continue;
        const category = catByColumn.get(task.columnId.toString()) ?? 'todo';
        if (RESOLVED_CATEGORIES.has(category)) continue;
        const policy = this.matchPolicy(task, activePolicies);
        if (!policy) continue;
        const startedAt = task.createdAt;
        await this.trackers.create({
          workspaceId: wid,
          taskId: task._id,
          projectId: task.projectId,
          policyId: policy._id,
          startedAt,
          responseDueAt: new Date(startedAt.getTime() + policy.responseHours * HOUR_MS),
          resolutionDueAt: new Date(startedAt.getTime() + policy.resolutionHours * HOUR_MS),
          state: 'ok',
        });
        created += 1;
      }
    }

    const open = await this.trackers.find({ workspaceId: wid, state: { $in: ['ok', 'warning', 'breached'] } }).exec();
    if (open.length === 0) return { evaluated: 0, warned: 0, breached: 0, created };

    const openTasks = await this.tasks
      .find({ _id: { $in: open.map((t) => t.taskId) } })
      .select('columnId completedAt projectId')
      .lean();
    const taskMap = new Map(openTasks.map((t) => [t._id.toString(), t]));
    const catByColumn = await this.columnCategoryMap(openTasks.map((t) => t.columnId));
    const policyMap = new Map(
      (await this.policies.find({ _id: { $in: [...new Set(open.map((t) => t.policyId.toString()))] } }).exec()).map((p) => [
        p._id.toString(),
        p,
      ]),
    );

    let warned = 0;
    let breached = 0;
    for (const tracker of open) {
      const task = taskMap.get(tracker.taskId.toString());
      const policy = policyMap.get(tracker.policyId.toString());
      if (!task || !policy) continue;
      const category = catByColumn.get(task.columnId.toString()) ?? 'todo';

      if (!tracker.firstResponseAt && !UNSTARTED_CATEGORIES.has(category)) tracker.firstResponseAt = now;
      if (!tracker.resolvedAt && RESOLVED_CATEGORIES.has(category)) {
        tracker.resolvedAt = task.completedAt ?? now;
      }

      const nextState = this.evaluateState(tracker, policy.warnAtPercent, now);
      tracker.lastEvaluatedAt = now;

      const wasLevel = tracker.escalationLevel;
      if (nextState === 'breached' && wasLevel < 2) {
        tracker.escalationLevel = 2;
        breached += 1;
        await this.notifications.notify(
          policy.escalateToUserIds.map((id) => id.toString()),
          {
            workspaceId,
            type: 'sla.breached',
            title: `SLA breached — ${policy.name}`,
            projectId: tracker.projectId.toString(),
            entityType: 'task',
            entityId: tracker.taskId.toString(),
          },
        );
      } else if (nextState === 'warning' && wasLevel < 1) {
        tracker.escalationLevel = 1;
        warned += 1;
        await this.notifications.notify(
          policy.notifyUserIds.map((id) => id.toString()),
          {
            workspaceId,
            type: 'sla.warning',
            title: `SLA at risk — ${policy.name}`,
            projectId: tracker.projectId.toString(),
            entityType: 'task',
            entityId: tracker.taskId.toString(),
          },
        );
      }

      tracker.state = nextState;
      await tracker.save();
    }

    this.realtime.emitToWorkspace(workspaceId, 'sla.updated', { swept: true, warned, breached }, actorId);
    return { evaluated: open.length, warned, breached, created };
  }

  // ── pure helpers ────────────────────────────────────────────────────────

  private matchPolicy(
    task: { projectId: Types.ObjectId; priority: string; type: string },
    policies: SlaPolicyDocument[],
  ): SlaPolicyDocument | null {
    for (const p of policies) {
      const a = p.appliesTo;
      if (a.projectIds.length && !a.projectIds.some((id) => id.equals(task.projectId))) continue;
      if (a.priorities.length && !a.priorities.includes(task.priority as TaskPriority)) continue;
      if (a.types.length && !a.types.includes(task.type)) continue;
      return p;
    }
    return null;
  }

  private evaluateState(tracker: SlaTrackerDocument, warnAtPercent: number, now: Date): SlaState {
    if (tracker.resolvedAt) {
      return tracker.resolvedAt.getTime() <= tracker.resolutionDueAt.getTime() ? 'met' : 'breached';
    }
    const t = now.getTime();
    if (t > tracker.resolutionDueAt.getTime()) return 'breached';
    if (!tracker.firstResponseAt && t > tracker.responseDueAt.getTime()) return 'breached';

    const warn = warnAtPercent / 100;
    const target = tracker.firstResponseAt ? tracker.resolutionDueAt : tracker.responseDueAt;
    const elapsed = t - tracker.startedAt.getTime();
    const window = target.getTime() - tracker.startedAt.getTime();
    if (window > 0 && elapsed / window >= warn) return 'warning';
    return 'ok';
  }

  private async columnCategoryMap(columnIds: Types.ObjectId[]): Promise<Map<string, string>> {
    const ids = [...new Set(columnIds.map((c) => c.toString()))];
    const cols = await this.columns.find({ _id: { $in: ids } }).select('statusCategory').lean();
    return new Map(cols.map((c) => [c._id.toString(), c.statusCategory]));
  }

  policyView(p: SlaPolicyDocument): SlaPolicyView {
    return {
      id: p.id,
      name: p.name,
      active: p.active,
      appliesTo: {
        projectIds: p.appliesTo.projectIds.map((id) => id.toString()),
        priorities: p.appliesTo.priorities,
        types: p.appliesTo.types,
      },
      responseHours: p.responseHours,
      resolutionHours: p.resolutionHours,
      warnAtPercent: p.warnAtPercent,
      notifyUserIds: p.notifyUserIds.map((id) => id.toString()),
      escalateToUserIds: p.escalateToUserIds.map((id) => id.toString()),
      createdAt: p.createdAt.toISOString(),
    };
  }
}
