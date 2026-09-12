import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { RecurrenceFreq, TaskPriority } from '@flowdesk/types';
import { ApiException } from '../../common/http/api-exception.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { RecurringTask, type RecurringTaskDocument } from './schemas/recurring-task.schema.js';

export interface CadenceInput {
  freq: RecurrenceFreq;
  interval?: number;
  byWeekday?: number[];
  byMonthDay?: number | null;
  atMinute?: number;
}

export interface RecurringTaskView {
  id: string;
  projectId: string;
  columnId: string | null;
  title: string;
  description: string;
  priority: TaskPriority;
  assigneeUserIds: string[];
  cadence: Required<Omit<CadenceInput, 'byMonthDay'>> & { byMonthDay: number | null };
  active: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  createdCount: number;
}

const DAY_MS = 86_400_000;

/** Next occurrence strictly after `from` for the cadence. UTC-based (v1). */
export function computeNext(from: Date, c: CadenceInput): Date {
  const interval = Math.max(1, c.interval ?? 1);
  const atMinute = c.atMinute ?? 540;
  const anchor = new Date(from);
  anchor.setUTCHours(0, atMinute, 0, 0);

  if (c.freq === 'daily') {
    let d = new Date(anchor);
    if (d <= from) d = new Date(d.getTime() + interval * DAY_MS);
    return d;
  }

  if (c.freq === 'weekly') {
    const days = (c.byWeekday && c.byWeekday.length > 0 ? c.byWeekday : [from.getUTCDay()]).slice().sort((a, b) => a - b);
    for (let addDays = 0; addDays <= 7 * interval + 7; addDays += 1) {
      const d = new Date(anchor.getTime() + addDays * DAY_MS);
      if (d > from && days.includes(d.getUTCDay())) return d;
    }
    return new Date(anchor.getTime() + 7 * interval * DAY_MS);
  }

  // monthly
  const targetDay = c.byMonthDay ?? from.getUTCDate();
  let year = from.getUTCFullYear();
  let month = from.getUTCMonth();
  for (let i = 0; i < 24; i += 1) {
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const day = Math.min(targetDay, daysInMonth);
    const candidate = new Date(Date.UTC(year, month, day, 0, atMinute, 0, 0));
    if (candidate > from) return candidate;
    month += interval;
    year += Math.floor(month / 12);
    month %= 12;
  }
  return new Date(from.getTime() + 30 * DAY_MS);
}

@Injectable()
export class RecurringService {
  private readonly logger = new Logger('RecurringService');

  constructor(
    @InjectModel(RecurringTask.name) private readonly model: Model<RecurringTaskDocument>,
    private readonly projects: ProjectsService,
    private readonly tasks: TasksService,
    private readonly realtime: RealtimeService,
  ) {}

  list(workspaceId: string, projectId?: string): Promise<RecurringTaskDocument[]> {
    const filter: Record<string, unknown> = { workspaceId: new Types.ObjectId(workspaceId) };
    if (projectId) filter.projectId = new Types.ObjectId(projectId);
    return this.model.find(filter).sort({ nextRunAt: 1 }).exec();
  }

  async getOrThrow(workspaceId: string, id: string): Promise<RecurringTaskDocument> {
    const doc = await this.model.findOne({ _id: id, workspaceId: new Types.ObjectId(workspaceId) }).exec();
    if (!doc) throw ApiException.notFound('Recurring task');
    return doc;
  }

  async create(
    workspaceId: string,
    userId: string,
    input: {
      projectId: string;
      columnId?: string | null;
      title: string;
      description?: string;
      priority?: TaskPriority;
      assigneeUserIds?: string[];
      cadence: CadenceInput;
      startAt?: string;
    },
  ): Promise<RecurringTaskDocument> {
    await this.projects.getOrThrow(workspaceId, input.projectId);
    const from = input.startAt ? new Date(input.startAt) : new Date();
    return this.model.create({
      workspaceId: new Types.ObjectId(workspaceId),
      projectId: new Types.ObjectId(input.projectId),
      columnId: input.columnId ? new Types.ObjectId(input.columnId) : null,
      title: input.title.trim(),
      description: input.description?.trim() ?? '',
      priority: input.priority ?? 'none',
      assigneeUserIds: (input.assigneeUserIds ?? []).map((id) => new Types.ObjectId(id)),
      cadence: this.normalizeCadence(input.cadence),
      nextRunAt: computeNext(new Date(from.getTime() - 1000), input.cadence),
      createdByUserId: new Types.ObjectId(userId),
    });
  }

  async update(
    workspaceId: string,
    id: string,
    patch: Partial<{
      title: string;
      description: string;
      priority: TaskPriority;
      assigneeUserIds: string[];
      columnId: string | null;
      cadence: CadenceInput;
      active: boolean;
    }>,
  ): Promise<RecurringTaskDocument> {
    const doc = await this.getOrThrow(workspaceId, id);
    if (patch.title !== undefined) doc.title = patch.title.trim();
    if (patch.description !== undefined) doc.description = patch.description.trim();
    if (patch.priority !== undefined) doc.priority = patch.priority;
    if (patch.assigneeUserIds !== undefined) doc.assigneeUserIds = patch.assigneeUserIds.map((x) => new Types.ObjectId(x));
    if (patch.columnId !== undefined) doc.columnId = patch.columnId ? new Types.ObjectId(patch.columnId) : null;
    if (patch.active !== undefined) doc.active = patch.active;
    if (patch.cadence !== undefined) {
      doc.cadence = this.normalizeCadence(patch.cadence) as RecurringTaskDocument['cadence'];
      doc.nextRunAt = computeNext(new Date(), patch.cadence);
    }
    await doc.save();
    return doc;
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const doc = await this.getOrThrow(workspaceId, id);
    await this.model.deleteOne({ _id: doc._id });
  }

  /** Pull-based: create a task for every active schedule whose nextRunAt has passed. */
  async runDue(workspaceId: string, userId: string): Promise<{ created: number; schedules: number }> {
    const now = new Date();
    const due = await this.model
      .find({ workspaceId: new Types.ObjectId(workspaceId), active: true, nextRunAt: { $lte: now } })
      .limit(200)
      .exec();

    let created = 0;
    for (const rt of due) {
      try {
        await this.tasks.create(workspaceId, userId, {
          projectId: rt.projectId.toString(),
          columnId: rt.columnId?.toString(),
          title: rt.title,
          description: rt.description ? `<p>${rt.description}</p>` : '',
          priority: rt.priority,
          assigneeUserIds: rt.assigneeUserIds.map((id) => id.toString()),
        });
        created += 1;
        rt.lastRunAt = now;
        rt.createdCount += 1;
        rt.nextRunAt = computeNext(now, rt.cadence);
        await rt.save();
      } catch (err) {
        this.logger.error(`recurring ${rt.id} failed: ${String(err)}`);
      }
    }
    if (created > 0) this.realtime.emitToWorkspace(workspaceId, 'task.created', { recurringBatch: created }, userId);
    return { created, schedules: due.length };
  }

  private normalizeCadence(c: CadenceInput): RecurringTaskDocument['cadence'] {
    return {
      freq: c.freq,
      interval: Math.max(1, Math.min(52, c.interval ?? 1)),
      byWeekday: (c.byWeekday ?? []).filter((d) => d >= 0 && d <= 6),
      byMonthDay: c.byMonthDay && c.byMonthDay >= 1 && c.byMonthDay <= 31 ? c.byMonthDay : null,
      atMinute: Math.max(0, Math.min(1439, c.atMinute ?? 540)),
    } as RecurringTaskDocument['cadence'];
  }

  toView(rt: RecurringTaskDocument): RecurringTaskView {
    return {
      id: rt.id,
      projectId: rt.projectId.toString(),
      columnId: rt.columnId?.toString() ?? null,
      title: rt.title,
      description: rt.description,
      priority: rt.priority,
      assigneeUserIds: rt.assigneeUserIds.map((id) => id.toString()),
      cadence: {
        freq: rt.cadence.freq,
        interval: rt.cadence.interval,
        byWeekday: rt.cadence.byWeekday,
        byMonthDay: rt.cadence.byMonthDay,
        atMinute: rt.cadence.atMinute,
      },
      active: rt.active,
      nextRunAt: rt.nextRunAt.toISOString(),
      lastRunAt: rt.lastRunAt?.toISOString() ?? null,
      createdCount: rt.createdCount,
    };
  }
}
