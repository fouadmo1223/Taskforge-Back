import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { TimesheetStatus } from '@flowdesk/types';
import { ApiException } from '../../common/http/api-exception.js';
import { TimeEntry, type TimeEntryDocument } from '../time-tracking/schemas/time-entry.schema.js';
import { Task, type TaskDocument } from '../tasks/schemas/task.schema.js';
import { Timesheet, type TimesheetDocument } from './schemas/timesheet.schema.js';

/** Monday 00:00:00 UTC for the week containing `iso`. */
export function weekStart(iso: string | Date): Date {
  const d = new Date(iso);
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = (day + 6) % 7; // days since Monday
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff, 0, 0, 0, 0));
}
function weekEnd(start: Date): Date {
  return new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
}

export interface TimesheetWeekView {
  periodStart: string;
  periodEnd: string;
  status: TimesheetStatus;
  totalSeconds: number;
  reviewNote: string | null;
  reviewedAt: string | null;
  rows: Array<{
    taskId: string;
    taskKey: string;
    taskTitle: string;
    projectId: string;
    byDay: number[]; // 7 entries, seconds, Mon..Sun
    total: number;
  }>;
}

@Injectable()
export class TimesheetsService {
  constructor(
    @InjectModel(Timesheet.name) private readonly model: Model<TimesheetDocument>,
    @InjectModel(TimeEntry.name) private readonly entries: Model<TimeEntryDocument>,
    @InjectModel(Task.name) private readonly tasks: Model<TaskDocument>,
  ) {}

  async week(workspaceId: string, userId: string, periodStartIso: string): Promise<TimesheetWeekView> {
    const start = weekStart(periodStartIso);
    const end = weekEnd(start);
    const wid = new Types.ObjectId(workspaceId);
    const uid = new Types.ObjectId(userId);

    const [sheet, entries] = await Promise.all([
      this.model.findOne({ workspaceId: wid, userId: uid, periodStart: start }).exec(),
      this.entries.find({ workspaceId: wid, userId: uid, startedAt: { $gte: start, $lte: end } }).sort({ startedAt: 1 }).exec(),
    ]);

    const taskIds = [...new Set(entries.map((e) => e.taskId.toString()))];
    const tasks = await this.tasks
      .find({ _id: { $in: taskIds.map((id) => new Types.ObjectId(id)) } })
      .select('key title projectId')
      .lean();
    const taskById = new Map(tasks.map((t) => [t._id.toString(), t]));

    const rowMap = new Map<string, TimesheetWeekView['rows'][number]>();
    for (const e of entries) {
      const tid = e.taskId.toString();
      if (!rowMap.has(tid)) {
        const tk = taskById.get(tid);
        rowMap.set(tid, {
          taskId: tid,
          taskKey: tk?.key ?? '',
          taskTitle: tk?.title ?? 'Task',
          projectId: (tk?.projectId ?? e.projectId).toString(),
          byDay: [0, 0, 0, 0, 0, 0, 0],
          total: 0,
        });
      }
      const row = rowMap.get(tid)!;
      const dayIdx = Math.floor((e.startedAt.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
      if (dayIdx >= 0 && dayIdx < 7) row.byDay[dayIdx]! += e.durationSeconds;
      row.total += e.durationSeconds;
    }

    const rows = [...rowMap.values()].sort((a, b) => b.total - a.total);
    const totalSeconds = rows.reduce((s, r) => s + r.total, 0);

    return {
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      status: sheet?.status ?? 'draft',
      totalSeconds,
      reviewNote: sheet?.reviewNote ?? null,
      reviewedAt: sheet?.reviewedAt?.toISOString() ?? null,
      rows,
    };
  }

  async submit(workspaceId: string, userId: string, periodStartIso: string): Promise<{ status: TimesheetStatus; totalSeconds: number }> {
    const start = weekStart(periodStartIso);
    const end = weekEnd(start);
    const wid = new Types.ObjectId(workspaceId);
    const uid = new Types.ObjectId(userId);

    const existing = await this.model.findOne({ workspaceId: wid, userId: uid, periodStart: start }).exec();
    if (existing && (existing.status === 'submitted' || existing.status === 'approved')) {
      throw ApiException.conflict('This week is already submitted.');
    }

    const entries = await this.entries.find({ workspaceId: wid, userId: uid, startedAt: { $gte: start, $lte: end }, timesheetId: null }).exec();
    if (entries.length === 0) throw ApiException.validation('There is no time logged for this week.');

    const totalSeconds = entries.reduce((s, e) => s + e.durationSeconds, 0);
    const sheet =
      existing ??
      new this.model({ workspaceId: wid, userId: uid, periodStart: start, periodEnd: end });
    sheet.status = 'submitted';
    sheet.submittedAt = new Date();
    sheet.totalSeconds = totalSeconds;
    sheet.reviewNote = null;
    sheet.reviewedByUserId = null;
    sheet.reviewedAt = null;
    await sheet.save();

    await this.entries.updateMany(
      { _id: { $in: entries.map((e) => e._id) } },
      { $set: { timesheetId: sheet._id, locked: true } },
    );
    return { status: 'submitted', totalSeconds };
  }

  async listPending(workspaceId: string): Promise<Array<{ id: string; userId: string; userName: string; periodStart: string; periodEnd: string; totalSeconds: number; submittedAt: string | null }>> {
    const rows = await this.model
      .find({ workspaceId: new Types.ObjectId(workspaceId), status: 'submitted' })
      .sort({ submittedAt: 1 })
      .populate('userId', 'name')
      .exec();
    return rows.map((r) => ({
      id: r.id,
      userId: (r.userId as unknown as { _id: unknown })._id?.toString() ?? '',
      userName: (r.userId as unknown as { name?: string }).name ?? 'Someone',
      periodStart: r.periodStart.toISOString(),
      periodEnd: r.periodEnd.toISOString(),
      totalSeconds: r.totalSeconds,
      submittedAt: r.submittedAt?.toISOString() ?? null,
    }));
  }

  async mine(workspaceId: string, userId: string): Promise<Array<{ id: string; periodStart: string; status: TimesheetStatus; totalSeconds: number; reviewNote: string | null }>> {
    const rows = await this.model
      .find({ workspaceId: new Types.ObjectId(workspaceId), userId: new Types.ObjectId(userId) })
      .sort({ periodStart: -1 })
      .limit(26)
      .exec();
    return rows.map((r) => ({ id: r.id, periodStart: r.periodStart.toISOString(), status: r.status, totalSeconds: r.totalSeconds, reviewNote: r.reviewNote }));
  }

  async review(
    workspaceId: string,
    reviewerId: string,
    timesheetId: string,
    decision: 'approve' | 'reject',
    note?: string,
  ): Promise<{ status: TimesheetStatus; ownerUserId: string; periodStart: string }> {
    const sheet = await this.model.findOne({ _id: timesheetId, workspaceId: new Types.ObjectId(workspaceId) }).exec();
    if (!sheet) throw ApiException.notFound('Timesheet');
    if (sheet.status !== 'submitted') throw ApiException.validation('Only submitted timesheets can be reviewed.');
    if (sheet.userId.toString() === reviewerId) throw ApiException.forbidden('You cannot review your own timesheet.');

    sheet.status = decision === 'approve' ? 'approved' : 'rejected';
    sheet.reviewedByUserId = new Types.ObjectId(reviewerId);
    sheet.reviewedAt = new Date();
    sheet.reviewNote = note?.slice(0, 1000) ?? null;
    await sheet.save();

    if (decision === 'reject') {
      // unlock entries so the user can fix them and resubmit
      await this.entries.updateMany({ timesheetId: sheet._id }, { $set: { timesheetId: null, locked: false } });
    }
    return { status: sheet.status, ownerUserId: sheet.userId.toString(), periodStart: sheet.periodStart.toISOString() };
  }
}
