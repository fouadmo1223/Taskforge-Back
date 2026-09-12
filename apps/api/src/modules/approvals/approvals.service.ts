import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { ApprovalDecision, ApprovalStatus, ApprovalStrategy } from '@flowdesk/types';
import { ApiException } from '../../common/http/api-exception.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { Approval, type ApprovalDocument } from './schemas/approval.schema.js';

export interface ApprovalStepView {
  id: string;
  order: number;
  approverUserId: string;
  decision: ApprovalDecision | null;
  comment: string;
  decidedAt: string | null;
  /** whether this step is the one currently awaiting a decision (sequential) */
  actionable: boolean;
}
export interface ApprovalView {
  id: string;
  subjectType: string;
  subjectId: string;
  projectId: string | null;
  title: string;
  description: string;
  strategy: ApprovalStrategy;
  requiredCount: number;
  status: ApprovalStatus;
  requestedByUserId: string;
  steps: ApprovalStepView[];
  decidedAt: string | null;
  createdAt: string;
}

export interface CreateApprovalInput {
  subjectType: Approval['subjectType'];
  subjectId: string;
  projectId?: string | null;
  title: string;
  description?: string;
  strategy: ApprovalStrategy;
  requiredCount?: number;
  approverUserIds: string[];
}

@Injectable()
export class ApprovalsService {
  constructor(
    @InjectModel(Approval.name) private readonly model: Model<ApprovalDocument>,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(workspaceId: string, userId: string, input: CreateApprovalInput): Promise<ApprovalDocument> {
    const approvers = [...new Set(input.approverUserIds)];
    if (approvers.length === 0) throw ApiException.validation('At least one approver is required.');
    if (input.strategy === 'n_of_m' && (input.requiredCount ?? 1) > approvers.length) {
      throw ApiException.validation('requiredCount cannot exceed the number of approvers.');
    }

    const approval = await this.model.create({
      workspaceId: new Types.ObjectId(workspaceId),
      subjectType: input.subjectType,
      subjectId: new Types.ObjectId(input.subjectId),
      projectId: input.projectId ? new Types.ObjectId(input.projectId) : null,
      title: input.title.trim(),
      description: input.description?.trim() ?? '',
      strategy: input.strategy,
      requiredCount: input.strategy === 'n_of_m' ? (input.requiredCount ?? 1) : 1,
      requestedByUserId: new Types.ObjectId(userId),
      status: 'pending',
      steps: approvers.map((approverUserId, i) => ({
        _id: new Types.ObjectId(),
        order: i,
        approverUserId: new Types.ObjectId(approverUserId),
        decision: null,
        comment: '',
        decidedAt: null,
      })),
    });

    // notify the approver(s) who can act now
    const actionable = this.actionableStepIds(approval);
    const toNotify = approval.steps.filter((s) => actionable.has(s._id.toString())).map((s) => s.approverUserId.toString());
    await this.notifications.notify(toNotify, {
      workspaceId,
      type: 'approval.requested',
      title: `Approval requested: ${approval.title}`,
      actorUserId: userId,
      projectId: approval.projectId?.toString() ?? null,
      entityType: 'approval',
      entityId: approval.id,
    });
    this.realtime.emitToWorkspace(workspaceId, 'approval.updated', { approval: this.toView(approval), action: 'created' }, userId);
    return approval;
  }

  listForSubject(workspaceId: string, subjectType: string, subjectId: string): Promise<ApprovalDocument[]> {
    return this.model
      .find({ workspaceId: new Types.ObjectId(workspaceId), subjectType, subjectId: new Types.ObjectId(subjectId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  listMinePending(workspaceId: string, userId: string): Promise<ApprovalDocument[]> {
    return this.model
      .find({
        workspaceId: new Types.ObjectId(workspaceId),
        status: 'pending',
        'steps.approverUserId': new Types.ObjectId(userId),
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  async getOrThrow(workspaceId: string, approvalId: string): Promise<ApprovalDocument> {
    const a = await this.model.findOne({ _id: approvalId, workspaceId: new Types.ObjectId(workspaceId) }).exec();
    if (!a) throw ApiException.notFound('Approval');
    return a;
  }

  async decide(
    workspaceId: string,
    approvalId: string,
    stepId: string,
    userId: string,
    decision: ApprovalDecision,
    comment?: string,
  ): Promise<ApprovalDocument> {
    const approval = await this.getOrThrow(workspaceId, approvalId);
    if (approval.status !== 'pending') throw ApiException.validation('This approval is already resolved.');

    const step = approval.steps.find((s) => s._id.toString() === stepId);
    if (!step) throw ApiException.notFound('Approval step');
    if (step.approverUserId.toString() !== userId) throw ApiException.forbidden('You are not the approver for this step.');
    if (step.decision) throw ApiException.validation('You have already decided on this step. Approval history is immutable.');
    if (!this.actionableStepIds(approval).has(stepId)) {
      throw ApiException.validation('An earlier approver has not decided yet.');
    }

    step.decision = decision;
    step.comment = comment?.slice(0, 2000) ?? '';
    step.decidedAt = new Date();

    const status = this.evaluate(approval);
    approval.status = status;
    if (status !== 'pending') approval.decidedAt = new Date();
    await approval.save();

    if (status === 'pending') {
      // notify the next actionable approver(s)
      const next = this.actionableStepIds(approval);
      const toNotify = approval.steps
        .filter((s) => next.has(s._id.toString()) && !s.decision)
        .map((s) => s.approverUserId.toString());
      await this.notifications.notify(toNotify, {
        workspaceId,
        type: 'approval.requested',
        title: `Your approval is needed: ${approval.title}`,
        actorUserId: userId,
        projectId: approval.projectId?.toString() ?? null,
        entityType: 'approval',
        entityId: approval.id,
      });
    } else {
      await this.notifications.notify([approval.requestedByUserId.toString()], {
        workspaceId,
        type: `approval.${status}`,
        title: `Approval ${status.replace('_', ' ')}: ${approval.title}`,
        body: comment ?? null,
        actorUserId: userId,
        projectId: approval.projectId?.toString() ?? null,
        entityType: 'approval',
        entityId: approval.id,
      });
    }

    this.realtime.emitToWorkspace(workspaceId, 'approval.updated', { approval: this.toView(approval), action: 'decided' }, userId);
    return approval;
  }

  async cancel(workspaceId: string, approvalId: string, userId: string, canModerate: boolean): Promise<ApprovalDocument> {
    const approval = await this.getOrThrow(workspaceId, approvalId);
    if (approval.requestedByUserId.toString() !== userId && !canModerate) {
      throw ApiException.forbidden('Only the requester can cancel this approval.');
    }
    if (approval.status !== 'pending') throw ApiException.validation('Only a pending approval can be cancelled.');
    approval.status = 'cancelled';
    approval.decidedAt = new Date();
    await approval.save();
    this.realtime.emitToWorkspace(workspaceId, 'approval.updated', { approval: this.toView(approval), action: 'cancelled' }, userId);
    return approval;
  }

  // ── evaluation ──────────────────────────────────────────────────────────

  /** Which step ids can be acted on right now (given the strategy + prior decisions). */
  private actionableStepIds(a: ApprovalDocument): Set<string> {
    if (a.strategy === 'sequential') {
      const sorted = [...a.steps].sort((x, y) => x.order - y.order);
      for (const s of sorted) {
        if (s.decision === 'rejected' || s.decision === 'changes_requested') return new Set();
        if (!s.decision) return new Set([s._id.toString()]);
      }
      return new Set();
    }
    // parallel_* and n_of_m: any undecided step is actionable
    return new Set(a.steps.filter((s) => !s.decision).map((s) => s._id.toString()));
  }

  private evaluate(a: ApprovalDocument): ApprovalStatus {
    const decisions = a.steps.map((s) => s.decision);
    if (decisions.includes('changes_requested')) return 'changes_requested';
    if (decisions.includes('rejected') && (a.strategy === 'sequential' || a.strategy === 'parallel_all')) return 'rejected';

    const approvals = decisions.filter((d) => d === 'approved').length;
    const rejections = decisions.filter((d) => d === 'rejected').length;
    const total = a.steps.length;

    switch (a.strategy) {
      case 'sequential':
      case 'parallel_all':
        return approvals === total ? 'approved' : 'pending';
      case 'parallel_any':
        if (approvals >= 1) return 'approved';
        return rejections === total ? 'rejected' : 'pending';
      case 'n_of_m': {
        if (approvals >= a.requiredCount) return 'approved';
        const remaining = total - approvals - rejections;
        return approvals + remaining < a.requiredCount ? 'rejected' : 'pending';
      }
      default:
        return 'pending';
    }
  }

  toView(a: ApprovalDocument): ApprovalView {
    const actionable = this.actionableStepIds(a);
    return {
      id: a.id,
      subjectType: a.subjectType,
      subjectId: a.subjectId.toString(),
      projectId: a.projectId?.toString() ?? null,
      title: a.title,
      description: a.description,
      strategy: a.strategy,
      requiredCount: a.requiredCount,
      status: a.status,
      requestedByUserId: a.requestedByUserId.toString(),
      decidedAt: a.decidedAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
      steps: [...a.steps]
        .sort((x, y) => x.order - y.order)
        .map((s) => ({
          id: s._id.toString(),
          order: s.order,
          approverUserId: s.approverUserId.toString(),
          decision: s.decision,
          comment: s.comment,
          decidedAt: s.decidedAt?.toISOString() ?? null,
          actionable: a.status === 'pending' && actionable.has(s._id.toString()),
        })),
    };
  }
}
