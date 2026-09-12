import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import type { TimerState } from '@flowdesk/types';
import { ApiException } from '../../common/http/api-exception.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { Task, type TaskDocument } from '../tasks/schemas/task.schema.js';
import { Workspace, type WorkspaceDocument } from '../workspaces/schemas/workspace.schema.js';
import { ActiveTimer, type ActiveTimerDocument } from './schemas/active-timer.schema.js';
import { TimeEntry, type TimeEntryDocument } from './schemas/time-entry.schema.js';

export interface TimerView {
  id: string;
  taskId: string;
  projectId: string;
  description: string;
  state: TimerState;
  startedAt: string;
  elapsedSeconds: number;
}

export interface TimeEntryView {
  id: string;
  taskId: string;
  projectId: string;
  userId: string;
  description: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  source: 'timer' | 'manual';
  locked: boolean;
}

function elapsed(timer: ActiveTimerDocument): number {
  const running = timer.state === 'running' && timer.lastResumedAt ? (Date.now() - timer.lastResumedAt.getTime()) / 1000 : 0;
  return Math.round(timer.accumulatedSeconds + running);
}

@Injectable()
export class TimeTrackingService {
  constructor(
    @InjectModel(ActiveTimer.name) private readonly timers: Model<ActiveTimerDocument>,
    @InjectModel(TimeEntry.name) private readonly entries: Model<TimeEntryDocument>,
    @InjectModel(Task.name) private readonly tasks: Model<TaskDocument>,
    @InjectModel(Workspace.name) private readonly workspaces: Model<WorkspaceDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly realtime: RealtimeService,
  ) {}

  // ── timer ───────────────────────────────────────────────────────────────

  async current(workspaceId: string, userId: string): Promise<TimerView | null> {
    const timer = await this.timers.findOne({ workspaceId: new Types.ObjectId(workspaceId), userId: new Types.ObjectId(userId) }).exec();
    return timer ? this.timerView(timer) : null;
  }

  async start(workspaceId: string, userId: string, taskId: string, description?: string): Promise<TimerView> {
    const task = await this.tasks.findOne({ _id: taskId, workspaceId: new Types.ObjectId(workspaceId), deletedAt: null }).select('projectId').lean();
    if (!task) throw ApiException.notFound('Task');

    const ws = await this.workspaces.findById(workspaceId).select('settings').lean();
    const concurrent = Boolean(ws?.settings?.allowConcurrentTimers);

    const existing = await this.timers.findOne({ workspaceId: new Types.ObjectId(workspaceId), userId: new Types.ObjectId(userId) }).exec();
    if (existing) {
      if (!concurrent) {
        // auto-stop the previous one so the new timer can start cleanly
        await this.stopTimer(existing, workspaceId, userId);
      } else {
        throw ApiException.conflict('You already have a running timer.');
      }
    }

    const timer = await this.timers.create({
      workspaceId: new Types.ObjectId(workspaceId),
      userId: new Types.ObjectId(userId),
      projectId: task.projectId,
      taskId: new Types.ObjectId(taskId),
      description: description?.slice(0, 500) ?? '',
      state: 'running',
      startedAt: new Date(),
      accumulatedSeconds: 0,
      lastResumedAt: new Date(),
    });
    const view = this.timerView(timer);
    this.realtime.emitToUser(userId, 'presence.updated', { timer: view }, userId);
    return view;
  }

  async pause(workspaceId: string, userId: string): Promise<TimerView> {
    const timer = await this.getTimer(workspaceId, userId);
    if (timer.state === 'paused') return this.timerView(timer);
    if (timer.lastResumedAt) {
      timer.accumulatedSeconds += Math.round((Date.now() - timer.lastResumedAt.getTime()) / 1000);
    }
    timer.state = 'paused';
    timer.lastResumedAt = null;
    await timer.save();
    return this.timerView(timer);
  }

  async resume(workspaceId: string, userId: string): Promise<TimerView> {
    const timer = await this.getTimer(workspaceId, userId);
    if (timer.state === 'running') return this.timerView(timer);
    timer.state = 'running';
    timer.lastResumedAt = new Date();
    await timer.save();
    return this.timerView(timer);
  }

  async stop(workspaceId: string, userId: string): Promise<TimeEntryView> {
    const timer = await this.getTimer(workspaceId, userId);
    return this.stopTimer(timer, workspaceId, userId);
  }

  private async stopTimer(timer: ActiveTimerDocument, workspaceId: string, userId: string): Promise<TimeEntryView> {
    const total = elapsed(timer);
    const endedAt = new Date();
    let entry!: TimeEntryDocument;
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const [created] = await this.entries.create(
          [
            {
              workspaceId: timer.workspaceId,
              projectId: timer.projectId,
              taskId: timer.taskId,
              userId: timer.userId,
              description: timer.description,
              startedAt: timer.startedAt,
              endedAt,
              durationSeconds: Math.max(1, total),
              source: 'timer',
            },
          ],
          { session },
        );
        entry = created!;
        await this.tasks.updateOne(
          { _id: timer.taskId },
          { $inc: { loggedHours: Math.max(1, total) / 3600 } },
          { session },
        );
        await this.timers.deleteOne({ _id: timer._id }, { session });
      });
    } finally {
      await session.endSession();
    }
    this.realtime.emitToUser(userId, 'presence.updated', { timer: null }, userId);
    this.realtime.emitToWorkspace(workspaceId, 'task.updated', { changed: ['loggedHours'] }, userId);
    return this.entryView(entry);
  }

  // ── manual entries ──────────────────────────────────────────────────────

  async addManual(
    workspaceId: string,
    userId: string,
    input: { taskId: string; startedAt: string; minutes: number; description?: string },
  ): Promise<TimeEntryView> {
    if (input.minutes <= 0 || input.minutes > 24 * 60) throw ApiException.validation('Minutes must be between 1 and 1440.');
    const task = await this.tasks.findOne({ _id: input.taskId, workspaceId: new Types.ObjectId(workspaceId), deletedAt: null }).select('projectId').lean();
    if (!task) throw ApiException.notFound('Task');
    const startedAt = new Date(input.startedAt);
    const durationSeconds = Math.round(input.minutes * 60);
    const entry = await this.entries.create({
      workspaceId: new Types.ObjectId(workspaceId),
      projectId: task.projectId,
      taskId: new Types.ObjectId(input.taskId),
      userId: new Types.ObjectId(userId),
      description: input.description?.slice(0, 500) ?? '',
      startedAt,
      endedAt: new Date(startedAt.getTime() + durationSeconds * 1000),
      durationSeconds,
      source: 'manual',
    });
    await this.tasks.updateOne({ _id: input.taskId }, { $inc: { loggedHours: durationSeconds / 3600 } });
    return this.entryView(entry);
  }

  async listEntries(
    workspaceId: string,
    filter: { userId?: string; taskId?: string; from?: Date; to?: Date; mineUserId: string; canReadAll: boolean },
  ): Promise<TimeEntryView[]> {
    const q: Record<string, unknown> = { workspaceId: new Types.ObjectId(workspaceId) };
    q.userId = new Types.ObjectId(filter.canReadAll && filter.userId ? filter.userId : filter.mineUserId);
    if (filter.taskId) q.taskId = new Types.ObjectId(filter.taskId);
    if (filter.from || filter.to) {
      const range: Record<string, Date> = {};
      if (filter.from) range.$gte = filter.from;
      if (filter.to) range.$lte = filter.to;
      q.startedAt = range;
    }
    const rows = await this.entries.find(q).sort({ startedAt: -1 }).limit(500).exec();
    return rows.map((r) => this.entryView(r));
  }

  async updateEntry(workspaceId: string, userId: string, entryId: string, patch: { minutes?: number; description?: string; startedAt?: string }): Promise<TimeEntryView> {
    const entry = await this.entries.findOne({ _id: entryId, workspaceId: new Types.ObjectId(workspaceId), userId: new Types.ObjectId(userId) }).exec();
    if (!entry) throw ApiException.notFound('Time entry');
    if (entry.locked) throw ApiException.forbidden('This entry is part of a submitted timesheet.');

    if (patch.description !== undefined) entry.description = patch.description.slice(0, 500);
    if (patch.startedAt !== undefined) entry.startedAt = new Date(patch.startedAt);
    if (patch.minutes !== undefined) {
      if (patch.minutes <= 0 || patch.minutes > 24 * 60) throw ApiException.validation('Minutes must be between 1 and 1440.');
      const oldSeconds = entry.durationSeconds;
      const newSeconds = Math.round(patch.minutes * 60);
      entry.durationSeconds = newSeconds;
      entry.endedAt = new Date(entry.startedAt.getTime() + newSeconds * 1000);
      await this.tasks.updateOne({ _id: entry.taskId }, { $inc: { loggedHours: (newSeconds - oldSeconds) / 3600 } });
    } else if (patch.startedAt !== undefined) {
      entry.endedAt = new Date(entry.startedAt.getTime() + entry.durationSeconds * 1000);
    }
    await entry.save();
    return this.entryView(entry);
  }

  async deleteEntry(workspaceId: string, userId: string, entryId: string): Promise<void> {
    const entry = await this.entries.findOne({ _id: entryId, workspaceId: new Types.ObjectId(workspaceId), userId: new Types.ObjectId(userId) }).exec();
    if (!entry) throw ApiException.notFound('Time entry');
    if (entry.locked) throw ApiException.forbidden('This entry is part of a submitted timesheet.');
    await this.entries.deleteOne({ _id: entry._id });
    await this.tasks.updateOne({ _id: entry.taskId }, { $inc: { loggedHours: -entry.durationSeconds / 3600 } });
  }

  // ── internals ───────────────────────────────────────────────────────────

  private async getTimer(workspaceId: string, userId: string): Promise<ActiveTimerDocument> {
    const timer = await this.timers.findOne({ workspaceId: new Types.ObjectId(workspaceId), userId: new Types.ObjectId(userId) }).exec();
    if (!timer) throw ApiException.notFound('No active timer');
    return timer;
  }

  private timerView(timer: ActiveTimerDocument): TimerView {
    return {
      id: timer.id,
      taskId: timer.taskId.toString(),
      projectId: timer.projectId.toString(),
      description: timer.description,
      state: timer.state,
      startedAt: timer.startedAt.toISOString(),
      elapsedSeconds: elapsed(timer),
    };
  }

  private entryView(e: TimeEntryDocument): TimeEntryView {
    return {
      id: e.id,
      taskId: e.taskId.toString(),
      projectId: e.projectId.toString(),
      userId: e.userId.toString(),
      description: e.description,
      startedAt: e.startedAt.toISOString(),
      endedAt: e.endedAt.toISOString(),
      durationSeconds: e.durationSeconds,
      source: e.source,
      locked: e.locked,
    };
  }
}
