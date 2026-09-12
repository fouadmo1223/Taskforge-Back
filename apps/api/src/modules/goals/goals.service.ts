import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { GOAL_STATUSES, type GoalStatus, type GoalType } from '@flowdesk/types';
import { ApiException } from '../../common/http/api-exception.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { Goal, type GoalDocument } from './schemas/goal.schema.js';

export interface KeyResultView {
  id: string;
  title: string;
  start: number;
  target: number;
  current: number;
  unit: string;
  progress: number;
}
export interface GoalView {
  id: string;
  title: string;
  description: string;
  type: GoalType;
  start: number;
  target: number;
  current: number;
  unit: string;
  status: GoalStatus;
  progress: number;
  ownerUserId: string | null;
  portfolioId: string | null;
  projectId: string | null;
  parentGoalId: string | null;
  keyResults: KeyResultView[];
  dueDate: string | null;
  createdAt: string;
}

function ratio(start: number, target: number, current: number): number {
  if (target === start) return current >= target ? 1 : 0;
  return Math.max(0, Math.min(1, (current - start) / (target - start)));
}

@Injectable()
export class GoalsService {
  constructor(
    @InjectModel(Goal.name) private readonly model: Model<GoalDocument>,
    private readonly realtime: RealtimeService,
  ) {}

  list(workspaceId: string, opts: { portfolioId?: string; projectId?: string; status?: GoalStatus } = {}): Promise<GoalDocument[]> {
    const filter: Record<string, unknown> = { workspaceId: new Types.ObjectId(workspaceId) };
    if (opts.portfolioId) filter.portfolioId = new Types.ObjectId(opts.portfolioId);
    if (opts.projectId) filter.projectId = new Types.ObjectId(opts.projectId);
    if (opts.status) filter.status = opts.status;
    return this.model.find(filter).sort({ createdAt: -1 }).exec();
  }

  async getOrThrow(workspaceId: string, id: string): Promise<GoalDocument> {
    const doc = await this.model.findOne({ _id: id, workspaceId: new Types.ObjectId(workspaceId) }).exec();
    if (!doc) throw ApiException.notFound('Goal');
    return doc;
  }

  async create(
    workspaceId: string,
    userId: string,
    input: {
      title: string;
      description?: string;
      type?: GoalType;
      start?: number;
      target?: number;
      current?: number;
      unit?: string;
      ownerUserId?: string | null;
      portfolioId?: string | null;
      projectId?: string | null;
      parentGoalId?: string | null;
      dueDate?: string | null;
    },
  ): Promise<GoalDocument> {
    const type = input.type ?? 'percent';
    const doc = await this.model.create({
      workspaceId: new Types.ObjectId(workspaceId),
      title: input.title.trim(),
      description: input.description?.trim() ?? '',
      type,
      start: input.start ?? 0,
      target: input.target ?? (type === 'binary' ? 1 : 100),
      current: input.current ?? 0,
      unit: input.unit?.trim() ?? (type === 'percent' ? '%' : ''),
      ownerUserId: input.ownerUserId ? new Types.ObjectId(input.ownerUserId) : null,
      portfolioId: input.portfolioId ? new Types.ObjectId(input.portfolioId) : null,
      projectId: input.projectId ? new Types.ObjectId(input.projectId) : null,
      parentGoalId: input.parentGoalId ? new Types.ObjectId(input.parentGoalId) : null,
      createdByUserId: new Types.ObjectId(userId),
    });
    this.emit(workspaceId, doc, userId);
    return doc;
  }

  async update(
    workspaceId: string,
    id: string,
    userId: string,
    patch: Partial<{
      title: string;
      description: string;
      target: number;
      current: number;
      unit: string;
      status: GoalStatus;
      ownerUserId: string | null;
      dueDate: string | null;
    }>,
  ): Promise<GoalDocument> {
    const doc = await this.getOrThrow(workspaceId, id);
    if (patch.title !== undefined) doc.title = patch.title.trim();
    if (patch.description !== undefined) doc.description = patch.description.trim();
    if (patch.target !== undefined) doc.target = patch.target;
    if (patch.current !== undefined) doc.current = patch.current;
    if (patch.unit !== undefined) doc.unit = patch.unit.trim();
    if (patch.ownerUserId !== undefined) doc.ownerUserId = patch.ownerUserId ? new Types.ObjectId(patch.ownerUserId) : null;
    if (patch.dueDate !== undefined) doc.dueDate = patch.dueDate ? new Date(patch.dueDate) : null;

    if (patch.status !== undefined) {
      if (!GOAL_STATUSES.includes(patch.status)) throw ApiException.validation('Invalid status.');
      doc.status = patch.status;
      doc.closedAt = patch.status === 'achieved' || patch.status === 'missed' ? new Date() : null;
    } else if (patch.current !== undefined) {
      // auto-status from progress + due date
      doc.status = this.deriveStatus(doc);
      if (doc.status === 'achieved') doc.closedAt = new Date();
    }
    await doc.save();
    this.emit(workspaceId, doc, userId);
    return doc;
  }

  async setKeyResults(
    workspaceId: string,
    id: string,
    userId: string,
    krs: Array<{ title: string; start?: number; target?: number; current?: number; unit?: string }>,
  ): Promise<GoalDocument> {
    const doc = await this.getOrThrow(workspaceId, id);
    doc.keyResults = krs.map((k) => ({
      _id: new Types.ObjectId(),
      title: k.title.trim(),
      start: k.start ?? 0,
      target: k.target ?? 100,
      current: k.current ?? 0,
      unit: k.unit?.trim() ?? '',
    })) as GoalDocument['keyResults'];
    // roll KR progress up into the goal's current (as a % when type=percent)
    if (doc.keyResults.length > 0 && doc.type === 'percent') {
      const avg =
        doc.keyResults.reduce((a, k) => a + ratio(k.start, k.target, k.current), 0) / doc.keyResults.length;
      doc.current = Math.round(avg * (doc.target - doc.start) + doc.start);
      doc.status = this.deriveStatus(doc);
    }
    await doc.save();
    this.emit(workspaceId, doc, userId);
    return doc;
  }

  async remove(workspaceId: string, id: string, userId: string): Promise<void> {
    const doc = await this.getOrThrow(workspaceId, id);
    await this.model.deleteOne({ _id: doc._id });
    await this.model.updateMany({ parentGoalId: doc._id }, { $set: { parentGoalId: null } });
    this.realtime.emitToWorkspace(workspaceId, 'goal.updated', { goalId: id, deleted: true }, userId);
  }

  private deriveStatus(doc: GoalDocument): GoalStatus {
    const p = ratio(doc.start, doc.target, doc.current);
    if (p >= 1) return 'achieved';
    if (!doc.dueDate) return p >= 0.7 ? 'on_track' : p >= 0.4 ? 'at_risk' : 'off_track';
    const now = Date.now();
    const created = doc.createdAt.getTime();
    const due = doc.dueDate.getTime();
    const timeElapsed = due > created ? Math.min(1, (now - created) / (due - created)) : 1;
    if (now > due) return 'missed';
    // pace: progress should track time elapsed
    if (p >= timeElapsed - 0.1) return 'on_track';
    if (p >= timeElapsed - 0.3) return 'at_risk';
    return 'off_track';
  }

  private emit(workspaceId: string, doc: GoalDocument, actorId: string): void {
    this.realtime.emitToWorkspace(workspaceId, 'goal.updated', { goal: this.toView(doc) }, actorId);
  }

  toView(g: GoalDocument): GoalView {
    return {
      id: g.id,
      title: g.title,
      description: g.description,
      type: g.type,
      start: g.start,
      target: g.target,
      current: g.current,
      unit: g.unit,
      status: g.status,
      progress: ratio(g.start, g.target, g.current),
      ownerUserId: g.ownerUserId?.toString() ?? null,
      portfolioId: g.portfolioId?.toString() ?? null,
      projectId: g.projectId?.toString() ?? null,
      parentGoalId: g.parentGoalId?.toString() ?? null,
      keyResults: g.keyResults.map((k) => ({
        id: k._id.toString(),
        title: k.title,
        start: k.start,
        target: k.target,
        current: k.current,
        unit: k.unit,
        progress: ratio(k.start, k.target, k.current),
      })),
      dueDate: g.dueDate?.toISOString() ?? null,
      createdAt: g.createdAt.toISOString(),
    };
  }
}
