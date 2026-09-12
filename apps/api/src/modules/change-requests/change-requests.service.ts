import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { ApprovalStrategy, ChangeRequestStatus } from '@flowdesk/types';
import { ApiException } from '../../common/http/api-exception.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { ApprovalsService } from '../approvals/approvals.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { ChangeRequest, type ChangeRequestDocument } from './schemas/change-request.schema.js';

export interface ChangeRequestView {
  id: string;
  projectId: string;
  number: number;
  key: string;
  title: string;
  description: string;
  reason: string;
  status: ChangeRequestStatus;
  scopeImpact: string;
  scheduleImpactDays: number;
  costImpact: number;
  approvalId: string | null;
  requestedByUserId: string;
  decidedAt: string | null;
  implementedAt: string | null;
  createdAt: string;
}

/** Allowed manual status moves (approval outcomes are applied separately). */
const TRANSITIONS: Record<ChangeRequestStatus, ChangeRequestStatus[]> = {
  draft: ['submitted'],
  submitted: ['in_review', 'draft'],
  in_review: ['approved', 'rejected'],
  approved: ['implemented'],
  rejected: ['draft'],
  implemented: [],
};

@Injectable()
export class ChangeRequestsService {
  constructor(
    @InjectModel(ChangeRequest.name) private readonly model: Model<ChangeRequestDocument>,
    private readonly projects: ProjectsService,
    private readonly approvals: ApprovalsService,
    private readonly realtime: RealtimeService,
  ) {}

  list(workspaceId: string, opts: { projectId?: string; status?: ChangeRequestStatus } = {}): Promise<ChangeRequestDocument[]> {
    const filter: Record<string, unknown> = { workspaceId: new Types.ObjectId(workspaceId) };
    if (opts.projectId) filter.projectId = new Types.ObjectId(opts.projectId);
    if (opts.status) filter.status = opts.status;
    return this.model.find(filter).sort({ createdAt: -1 }).exec();
  }

  async getOrThrow(workspaceId: string, id: string): Promise<ChangeRequestDocument> {
    const doc = await this.model.findOne({ _id: id, workspaceId: new Types.ObjectId(workspaceId) }).exec();
    if (!doc) throw ApiException.notFound('Change request');
    return doc;
  }

  async create(
    workspaceId: string,
    projectId: string,
    userId: string,
    input: { title: string; description?: string; reason?: string; scopeImpact?: string; scheduleImpactDays?: number; costImpact?: number },
  ): Promise<ChangeRequestDocument> {
    await this.projects.getOrThrow(workspaceId, projectId);
    const last = await this.model
      .findOne({ workspaceId: new Types.ObjectId(workspaceId), projectId: new Types.ObjectId(projectId) })
      .sort({ number: -1 })
      .select('number')
      .lean();
    const doc = await this.model.create({
      workspaceId: new Types.ObjectId(workspaceId),
      projectId: new Types.ObjectId(projectId),
      number: (last?.number ?? 0) + 1,
      title: input.title.trim(),
      description: input.description?.trim() ?? '',
      reason: input.reason?.trim() ?? '',
      scopeImpact: input.scopeImpact?.trim() ?? '',
      scheduleImpactDays: input.scheduleImpactDays ?? 0,
      costImpact: input.costImpact ?? 0,
      requestedByUserId: new Types.ObjectId(userId),
    });
    this.emit(workspaceId, doc, userId);
    return doc;
  }

  async update(
    workspaceId: string,
    id: string,
    userId: string,
    patch: Partial<{ title: string; description: string; reason: string; scopeImpact: string; scheduleImpactDays: number; costImpact: number }>,
  ): Promise<ChangeRequestDocument> {
    const doc = await this.getOrThrow(workspaceId, id);
    if (doc.status === 'implemented') throw ApiException.validation('Implemented change requests are locked.');
    if (patch.title !== undefined) doc.title = patch.title.trim();
    if (patch.description !== undefined) doc.description = patch.description.trim();
    if (patch.reason !== undefined) doc.reason = patch.reason.trim();
    if (patch.scopeImpact !== undefined) doc.scopeImpact = patch.scopeImpact.trim();
    if (patch.scheduleImpactDays !== undefined) doc.scheduleImpactDays = patch.scheduleImpactDays;
    if (patch.costImpact !== undefined) doc.costImpact = patch.costImpact;
    await doc.save();
    this.emit(workspaceId, doc, userId);
    return doc;
  }

  async transition(workspaceId: string, id: string, userId: string, to: ChangeRequestStatus): Promise<ChangeRequestDocument> {
    const doc = await this.getOrThrow(workspaceId, id);
    if (!TRANSITIONS[doc.status].includes(to)) {
      throw ApiException.validation(`Cannot move a ${doc.status} change request to ${to}.`);
    }
    doc.status = to;
    if (to === 'approved' || to === 'rejected') doc.decidedAt = new Date();
    if (to === 'implemented') doc.implementedAt = new Date();
    await doc.save();
    this.emit(workspaceId, doc, userId);
    return doc;
  }

  async requestApproval(
    workspaceId: string,
    id: string,
    userId: string,
    input: { approverUserIds: string[]; strategy: ApprovalStrategy; requiredCount?: number },
  ): Promise<ChangeRequestDocument> {
    const doc = await this.getOrThrow(workspaceId, id);
    if (doc.approvalId) throw ApiException.validation('An approval has already been requested for this change.');
    if (doc.status === 'draft') doc.status = 'submitted';

    const approval = await this.approvals.create(workspaceId, userId, {
      subjectType: 'change_request',
      subjectId: doc.id,
      projectId: doc.projectId.toString(),
      title: `${this.key(doc)} — ${doc.title}`,
      description: doc.reason,
      strategy: input.strategy,
      requiredCount: input.requiredCount,
      approverUserIds: input.approverUserIds,
    });
    doc.approvalId = approval._id;
    doc.status = 'in_review';
    await doc.save();
    this.emit(workspaceId, doc, userId);
    return doc;
  }

  private key(doc: ChangeRequestDocument): string {
    return `CR-${doc.number}`;
  }

  private emit(workspaceId: string, doc: ChangeRequestDocument, actorId: string): void {
    this.realtime.emitToWorkspace(workspaceId, 'change_request.updated', { changeRequest: this.toView(doc) }, actorId);
  }

  toView(c: ChangeRequestDocument): ChangeRequestView {
    return {
      id: c.id,
      projectId: c.projectId.toString(),
      number: c.number,
      key: this.key(c),
      title: c.title,
      description: c.description,
      reason: c.reason,
      status: c.status,
      scopeImpact: c.scopeImpact,
      scheduleImpactDays: c.scheduleImpactDays,
      costImpact: c.costImpact,
      approvalId: c.approvalId?.toString() ?? null,
      requestedByUserId: c.requestedByUserId.toString(),
      decidedAt: c.decidedAt?.toISOString() ?? null,
      implementedAt: c.implementedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    };
  }
}
