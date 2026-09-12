import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { WorkloadBand } from '@flowdesk/types';
import { ApiException } from '../../common/http/api-exception.js';
import { Task, type TaskDocument } from '../tasks/schemas/task.schema.js';
import { Project, type ProjectDocument } from '../projects/schemas/project.schema.js';
import { WorkspaceMembership, type WorkspaceMembershipDocument } from '../memberships/schemas/workspace-membership.schema.js';
import {
  Availability,
  AvailabilityException,
  type AvailabilityDocument,
  type AvailabilityExceptionDocument,
} from './schemas/availability.schema.js';

const DAY = 24 * 60 * 60 * 1000;

export interface AvailabilityView {
  userId: string;
  weeklyHours: number;
  workingDays: number[];
  hoursPerDay: number;
  timezone: string;
}

export interface WorkloadRow {
  userId: string;
  availableHours: number;
  plannedHours: number;
  unscheduledHours: number;
  band: WorkloadBand;
  ratio: number;
  byProject: Array<{ projectId: string; projectName: string; hours: number }>;
  tasks: Array<{ taskId: string; key: string; title: string; projectId: string; plannedHours: number; dueDate: string | null }>;
}

function bandFor(ratio: number): WorkloadBand {
  if (ratio < 0.5) return 'available';
  if (ratio <= 0.85) return 'healthy';
  if (ratio <= 1.0) return 'near_capacity';
  return 'overloaded';
}

function isoWeekday(d: Date): number {
  return ((d.getUTCDay() + 6) % 7) + 1; // 1..7, Mon..Sun
}
function dayKey(d: Date): number {
  return Math.floor(d.getTime() / DAY);
}

@Injectable()
export class WorkloadService {
  constructor(
    @InjectModel(Availability.name) private readonly availability: Model<AvailabilityDocument>,
    @InjectModel(AvailabilityException.name) private readonly exceptions: Model<AvailabilityExceptionDocument>,
    @InjectModel(Task.name) private readonly tasks: Model<TaskDocument>,
    @InjectModel(Project.name) private readonly projects: Model<ProjectDocument>,
    @InjectModel(WorkspaceMembership.name) private readonly memberships: Model<WorkspaceMembershipDocument>,
  ) {}

  // ── availability config ─────────────────────────────────────────────────

  async getForUser(workspaceId: string, userId: string): Promise<AvailabilityView> {
    const doc = await this.availability
      .findOne({ workspaceId: new Types.ObjectId(workspaceId), userId: new Types.ObjectId(userId) })
      .exec();
    return this.view(userId, doc);
  }

  async updateForUser(
    workspaceId: string,
    userId: string,
    patch: Partial<{ weeklyHours: number; workingDays: number[]; hoursPerDay: number; timezone: string }>,
  ): Promise<AvailabilityView> {
    const doc = await this.availability.findOneAndUpdate(
      { workspaceId: new Types.ObjectId(workspaceId), userId: new Types.ObjectId(userId) },
      {
        $set: {
          ...(patch.weeklyHours !== undefined ? { weeklyHours: patch.weeklyHours } : {}),
          ...(patch.workingDays ? { workingDays: [...new Set(patch.workingDays)].filter((d) => d >= 1 && d <= 7) } : {}),
          ...(patch.hoursPerDay !== undefined ? { hoursPerDay: patch.hoursPerDay } : {}),
          ...(patch.timezone ? { timezone: patch.timezone } : {}),
        },
      },
      { new: true, upsert: true },
    );
    return this.view(userId, doc);
  }

  async listForWorkspace(workspaceId: string): Promise<AvailabilityView[]> {
    const wid = new Types.ObjectId(workspaceId);
    const [members, docs] = await Promise.all([
      this.memberships.find({ workspaceId: wid, status: 'active', userId: { $ne: null }, isClient: false }).select('userId').lean(),
      this.availability.find({ workspaceId: wid }).lean(),
    ]);
    const byUser = new Map(docs.map((d) => [d.userId.toString(), d]));
    return members
      .filter((m) => m.userId)
      .map((m) => this.view(m.userId!.toString(), byUser.get(m.userId!.toString()) ?? null));
  }

  // ── exceptions ─────────────────────────────────────────────────────────

  async listExceptions(workspaceId: string, opts: { userId?: string; from?: Date; to?: Date }): Promise<AvailabilityExceptionDocument[]> {
    const q: Record<string, unknown> = { workspaceId: new Types.ObjectId(workspaceId) };
    if (opts.userId) q.$or = [{ userId: new Types.ObjectId(opts.userId) }, { userId: null }];
    if (opts.from || opts.to) {
      q.from = opts.to ? { $lte: opts.to } : undefined;
      q.to = opts.from ? { $gte: opts.from } : undefined;
      if (!opts.to) delete q.from;
      if (!opts.from) delete q.to;
    }
    return this.exceptions.find(q).sort({ from: 1 }).exec();
  }

  createException(
    workspaceId: string,
    input: { userId: string | null; type: 'leave' | 'holiday' | 'partial'; from: string; to: string; hoursPerDay?: number; note?: string },
  ): Promise<AvailabilityExceptionDocument> {
    const from = new Date(input.from);
    const to = new Date(input.to);
    if (to < from) throw ApiException.validation('End date must be after the start date.');
    return this.exceptions.create({
      workspaceId: new Types.ObjectId(workspaceId),
      userId: input.type === 'holiday' ? null : input.userId ? new Types.ObjectId(input.userId) : null,
      type: input.type,
      from,
      to,
      hoursPerDay: input.type === 'partial' ? (input.hoursPerDay ?? 4) : 0,
      note: input.note?.slice(0, 200) ?? '',
    });
  }

  async removeException(workspaceId: string, exceptionId: string): Promise<void> {
    const res = await this.exceptions.deleteOne({ _id: exceptionId, workspaceId: new Types.ObjectId(workspaceId) });
    if (res.deletedCount === 0) throw ApiException.notFound('Exception');
  }

  // ── workload computation ───────────────────────────────────────────────

  async workload(workspaceId: string, from: Date, to: Date, projectId?: string): Promise<WorkloadRow[]> {
    const wid = new Types.ObjectId(workspaceId);
    const rangeStart = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    const rangeEnd = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));

    const [members, availDocs, exceptionDocs, taskFilter] = await Promise.all([
      this.memberships.find({ workspaceId: wid, status: 'active', userId: { $ne: null }, isClient: false }).select('userId').lean(),
      this.availability.find({ workspaceId: wid }).lean(),
      this.exceptions.find({ workspaceId: wid, from: { $lte: rangeEnd }, to: { $gte: rangeStart } }).lean(),
      Promise.resolve(null),
    ]);
    void taskFilter;

    const userIds = members.filter((m) => m.userId).map((m) => m.userId!.toString());
    const availByUser = new Map(availDocs.map((d) => [d.userId.toString(), d]));

    const taskQuery: Record<string, unknown> = {
      workspaceId: wid,
      deletedAt: null,
      archivedAt: null,
      completedAt: null,
      assigneeUserIds: { $in: userIds.map((id) => new Types.ObjectId(id)) },
    };
    if (projectId) taskQuery.projectId = new Types.ObjectId(projectId);
    const tasks = await this.tasks
      .find(taskQuery)
      .select('key title projectId assigneeUserIds startDate dueDate estimateHours loggedHours')
      .lean();

    const projectIds = [...new Set(tasks.map((t) => t.projectId.toString()))];
    const projects = await this.projects
      .find({ _id: { $in: projectIds.map((id) => new Types.ObjectId(id)) } })
      .select('name')
      .lean();
    const projName = new Map(projects.map((p) => [p._id.toString(), p.name]));

    return userIds.map((userId) => {
      const avail = availByUser.get(userId);
      const workingDays = new Set(avail?.workingDays ?? [1, 2, 3, 4, 5]);
      const baseHoursPerDay = avail?.hoursPerDay ?? 8;

      // available hours across the range
      const userExceptions = exceptionDocs.filter((e) => e.userId === null || e.userId.toString() === userId);
      let availableHours = 0;
      const workingDayKeys: number[] = [];
      for (let ts = rangeStart.getTime(); ts <= rangeEnd.getTime(); ts += DAY) {
        const d = new Date(ts);
        if (!workingDays.has(isoWeekday(d))) continue;
        let dayHours = baseHoursPerDay;
        for (const ex of userExceptions) {
          if (ts >= dayKey(ex.from) * DAY && ts <= dayKey(ex.to) * DAY + DAY - 1) {
            dayHours = ex.type === 'partial' ? Math.min(dayHours, ex.hoursPerDay) : 0;
          }
        }
        availableHours += dayHours;
        if (dayHours > 0) workingDayKeys.push(dayKey(d));
      }

      // planned hours from assigned tasks
      let plannedHours = 0;
      let unscheduledHours = 0;
      const byProject = new Map<string, number>();
      const taskRows: WorkloadRow['tasks'] = [];
      for (const t of tasks) {
        if (!t.assigneeUserIds.some((a) => a.toString() === userId)) continue;
        const remaining = Math.max(0, (t.estimateHours ?? 0) - (t.loggedHours ?? 0));
        if (remaining === 0) continue;
        const share = remaining / Math.max(1, t.assigneeUserIds.length);

        let planned = 0;
        if (t.startDate && t.dueDate) {
          const s = Math.max(dayKey(new Date(t.startDate)), workingDayKeys[0] ?? -Infinity);
          const e = Math.min(dayKey(new Date(t.dueDate)), workingDayKeys[workingDayKeys.length - 1] ?? Infinity);
          const daysInWindow = workingDayKeys.filter((k) => k >= s && k <= e).length;
          const totalWorkDays = Math.max(
            1,
            Math.round(
              (dayKey(new Date(t.dueDate)) - dayKey(new Date(t.startDate)) + 1) * (workingDays.size / 7),
            ),
          );
          planned = daysInWindow > 0 ? (share * daysInWindow) / totalWorkDays : 0;
        } else {
          unscheduledHours += share;
        }
        if (planned > 0) {
          plannedHours += planned;
          byProject.set(t.projectId.toString(), (byProject.get(t.projectId.toString()) ?? 0) + planned);
          taskRows.push({
            taskId: t._id.toString(),
            key: t.key,
            title: t.title,
            projectId: t.projectId.toString(),
            plannedHours: Math.round(planned * 10) / 10,
            dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
          });
        }
      }

      const ratio = availableHours > 0 ? plannedHours / availableHours : plannedHours > 0 ? 2 : 0;
      return {
        userId,
        availableHours: Math.round(availableHours * 10) / 10,
        plannedHours: Math.round(plannedHours * 10) / 10,
        unscheduledHours: Math.round(unscheduledHours * 10) / 10,
        band: bandFor(ratio),
        ratio: Math.round(ratio * 100) / 100,
        byProject: [...byProject.entries()].map(([projectId, hours]) => ({
          projectId,
          projectName: projName.get(projectId) ?? 'Project',
          hours: Math.round(hours * 10) / 10,
        })),
        tasks: taskRows.sort((a, b) => b.plannedHours - a.plannedHours),
      };
    });
  }

  private view(
    userId: string,
    doc: { weeklyHours?: number; workingDays?: number[]; hoursPerDay?: number; timezone?: string } | null,
  ): AvailabilityView {
    return {
      userId,
      weeklyHours: doc?.weeklyHours ?? 40,
      workingDays: doc?.workingDays ?? [1, 2, 3, 4, 5],
      hoursPerDay: doc?.hoursPerDay ?? 8,
      timezone: doc?.timezone ?? 'UTC',
    };
  }

  exceptionView(e: AvailabilityExceptionDocument): {
    id: string;
    userId: string | null;
    type: string;
    from: string;
    to: string;
    hoursPerDay: number;
    note: string;
  } {
    return {
      id: e.id,
      userId: e.userId?.toString() ?? null,
      type: e.type,
      from: e.from.toISOString(),
      to: e.to.toISOString(),
      hoursPerDay: e.hoursPerDay,
      note: e.note,
    };
  }
}
