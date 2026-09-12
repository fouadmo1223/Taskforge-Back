import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ISSUE_STATUSES,
  RISK_STATUSES,
  DECISION_STATUSES,
  type DecisionStatus,
  type IssueStatus,
  type RiskScale,
  type RiskStatus,
  type Severity,
} from '@flowdesk/types';
import { ApiException } from '../../common/http/api-exception.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import {
  Decision,
  Issue,
  Risk,
  deriveSeverity,
  type DecisionDocument,
  type IssueDocument,
  type RiskDocument,
} from './schemas/raid.schema.js';

export interface RiskView {
  id: string;
  projectId: string;
  title: string;
  description: string;
  probability: RiskScale;
  impact: RiskScale;
  severity: Severity;
  status: RiskStatus;
  ownerUserId: string | null;
  mitigation: string;
  contingency: string;
  reviewDate: string | null;
  closedAt: string | null;
  createdAt: string;
}
export interface IssueView {
  id: string;
  projectId: string;
  title: string;
  description: string;
  severity: Severity;
  status: IssueStatus;
  ownerUserId: string | null;
  linkedRiskId: string | null;
  linkedTaskId: string | null;
  dueDate: string | null;
  resolvedAt: string | null;
  createdAt: string;
}
export interface DecisionView {
  id: string;
  projectId: string;
  title: string;
  context: string;
  decision: string;
  status: DecisionStatus;
  decidedByUserId: string | null;
  decidedAt: string | null;
  supersedesId: string | null;
  createdAt: string;
}

@Injectable()
export class GovernanceService {
  constructor(
    @InjectModel(Risk.name) private readonly risks: Model<RiskDocument>,
    @InjectModel(Issue.name) private readonly issues: Model<IssueDocument>,
    @InjectModel(Decision.name) private readonly decisions: Model<DecisionDocument>,
    private readonly projects: ProjectsService,
    private readonly realtime: RealtimeService,
  ) {}

  // ── risks ───────────────────────────────────────────────────────────────

  listRisks(workspaceId: string, projectId: string): Promise<RiskDocument[]> {
    return this.risks
      .find({ workspaceId: new Types.ObjectId(workspaceId), projectId: new Types.ObjectId(projectId) })
      .sort({ severity: -1, createdAt: -1 })
      .exec();
  }

  async createRisk(
    workspaceId: string,
    projectId: string,
    userId: string,
    input: { title: string; description?: string; probability?: RiskScale; impact?: RiskScale; ownerUserId?: string | null; mitigation?: string; contingency?: string; reviewDate?: string | null },
  ): Promise<RiskDocument> {
    await this.projects.getOrThrow(workspaceId, projectId);
    const probability = input.probability ?? 'medium';
    const impact = input.impact ?? 'medium';
    const doc = await this.risks.create({
      workspaceId: new Types.ObjectId(workspaceId),
      projectId: new Types.ObjectId(projectId),
      title: input.title.trim(),
      description: input.description?.trim() ?? '',
      probability,
      impact,
      severity: deriveSeverity(probability, impact),
      ownerUserId: input.ownerUserId ? new Types.ObjectId(input.ownerUserId) : null,
      mitigation: input.mitigation?.trim() ?? '',
      contingency: input.contingency?.trim() ?? '',
      reviewDate: input.reviewDate ? new Date(input.reviewDate) : null,
      createdByUserId: new Types.ObjectId(userId),
    });
    this.emit(workspaceId, 'risk.updated', { risk: this.riskView(doc) }, userId);
    return doc;
  }

  async updateRisk(
    workspaceId: string,
    riskId: string,
    userId: string,
    patch: Partial<{ title: string; description: string; probability: RiskScale; impact: RiskScale; status: RiskStatus; ownerUserId: string | null; mitigation: string; contingency: string; reviewDate: string | null }>,
  ): Promise<RiskDocument> {
    const doc = await this.findRisk(workspaceId, riskId);
    if (patch.title !== undefined) doc.title = patch.title.trim();
    if (patch.description !== undefined) doc.description = patch.description.trim();
    if (patch.probability !== undefined) doc.probability = patch.probability;
    if (patch.impact !== undefined) doc.impact = patch.impact;
    if (patch.probability !== undefined || patch.impact !== undefined) {
      doc.severity = deriveSeverity(doc.probability, doc.impact);
    }
    if (patch.status !== undefined) {
      if (!RISK_STATUSES.includes(patch.status)) throw ApiException.validation('Invalid status.');
      doc.status = patch.status;
      doc.closedAt = patch.status === 'closed' || patch.status === 'accepted' ? new Date() : null;
    }
    if (patch.ownerUserId !== undefined) doc.ownerUserId = patch.ownerUserId ? new Types.ObjectId(patch.ownerUserId) : null;
    if (patch.mitigation !== undefined) doc.mitigation = patch.mitigation.trim();
    if (patch.contingency !== undefined) doc.contingency = patch.contingency.trim();
    if (patch.reviewDate !== undefined) doc.reviewDate = patch.reviewDate ? new Date(patch.reviewDate) : null;
    await doc.save();
    this.emit(workspaceId, 'risk.updated', { risk: this.riskView(doc) }, userId);
    return doc;
  }

  async deleteRisk(workspaceId: string, riskId: string, userId: string): Promise<void> {
    const doc = await this.findRisk(workspaceId, riskId);
    await this.risks.deleteOne({ _id: doc._id });
    this.emit(workspaceId, 'risk.updated', { riskId, deleted: true }, userId);
  }

  private async findRisk(workspaceId: string, riskId: string): Promise<RiskDocument> {
    const doc = await this.risks.findOne({ _id: riskId, workspaceId: new Types.ObjectId(workspaceId) }).exec();
    if (!doc) throw ApiException.notFound('Risk');
    return doc;
  }

  // ── issues ──────────────────────────────────────────────────────────────

  listIssues(workspaceId: string, projectId: string): Promise<IssueDocument[]> {
    return this.issues
      .find({ workspaceId: new Types.ObjectId(workspaceId), projectId: new Types.ObjectId(projectId) })
      .sort({ severity: -1, createdAt: -1 })
      .exec();
  }

  async createIssue(
    workspaceId: string,
    projectId: string,
    userId: string,
    input: { title: string; description?: string; severity?: Severity; ownerUserId?: string | null; linkedRiskId?: string | null; linkedTaskId?: string | null; dueDate?: string | null },
  ): Promise<IssueDocument> {
    await this.projects.getOrThrow(workspaceId, projectId);
    const doc = await this.issues.create({
      workspaceId: new Types.ObjectId(workspaceId),
      projectId: new Types.ObjectId(projectId),
      title: input.title.trim(),
      description: input.description?.trim() ?? '',
      severity: input.severity ?? 'medium',
      ownerUserId: input.ownerUserId ? new Types.ObjectId(input.ownerUserId) : null,
      linkedRiskId: input.linkedRiskId ? new Types.ObjectId(input.linkedRiskId) : null,
      linkedTaskId: input.linkedTaskId ? new Types.ObjectId(input.linkedTaskId) : null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      createdByUserId: new Types.ObjectId(userId),
    });
    this.emit(workspaceId, 'issue.updated', { issue: this.issueView(doc) }, userId);
    return doc;
  }

  async updateIssue(
    workspaceId: string,
    issueId: string,
    userId: string,
    patch: Partial<{ title: string; description: string; severity: Severity; status: IssueStatus; ownerUserId: string | null; linkedRiskId: string | null; linkedTaskId: string | null; dueDate: string | null }>,
  ): Promise<IssueDocument> {
    const doc = await this.findIssue(workspaceId, issueId);
    if (patch.title !== undefined) doc.title = patch.title.trim();
    if (patch.description !== undefined) doc.description = patch.description.trim();
    if (patch.severity !== undefined) doc.severity = patch.severity;
    if (patch.status !== undefined) {
      if (!ISSUE_STATUSES.includes(patch.status)) throw ApiException.validation('Invalid status.');
      doc.status = patch.status;
      doc.resolvedAt = patch.status === 'resolved' || patch.status === 'closed' ? new Date() : null;
    }
    if (patch.ownerUserId !== undefined) doc.ownerUserId = patch.ownerUserId ? new Types.ObjectId(patch.ownerUserId) : null;
    if (patch.linkedRiskId !== undefined) doc.linkedRiskId = patch.linkedRiskId ? new Types.ObjectId(patch.linkedRiskId) : null;
    if (patch.linkedTaskId !== undefined) doc.linkedTaskId = patch.linkedTaskId ? new Types.ObjectId(patch.linkedTaskId) : null;
    if (patch.dueDate !== undefined) doc.dueDate = patch.dueDate ? new Date(patch.dueDate) : null;
    await doc.save();
    this.emit(workspaceId, 'issue.updated', { issue: this.issueView(doc) }, userId);
    return doc;
  }

  async deleteIssue(workspaceId: string, issueId: string, userId: string): Promise<void> {
    const doc = await this.findIssue(workspaceId, issueId);
    await this.issues.deleteOne({ _id: doc._id });
    this.emit(workspaceId, 'issue.updated', { issueId, deleted: true }, userId);
  }

  private async findIssue(workspaceId: string, issueId: string): Promise<IssueDocument> {
    const doc = await this.issues.findOne({ _id: issueId, workspaceId: new Types.ObjectId(workspaceId) }).exec();
    if (!doc) throw ApiException.notFound('Issue');
    return doc;
  }

  // ── decisions ───────────────────────────────────────────────────────────

  listDecisions(workspaceId: string, projectId: string): Promise<DecisionDocument[]> {
    return this.decisions
      .find({ workspaceId: new Types.ObjectId(workspaceId), projectId: new Types.ObjectId(projectId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async createDecision(
    workspaceId: string,
    projectId: string,
    userId: string,
    input: { title: string; context?: string; decision?: string; supersedesId?: string | null },
  ): Promise<DecisionDocument> {
    await this.projects.getOrThrow(workspaceId, projectId);
    const doc = await this.decisions.create({
      workspaceId: new Types.ObjectId(workspaceId),
      projectId: new Types.ObjectId(projectId),
      title: input.title.trim(),
      context: input.context?.trim() ?? '',
      decision: input.decision?.trim() ?? '',
      supersedesId: input.supersedesId ? new Types.ObjectId(input.supersedesId) : null,
      createdByUserId: new Types.ObjectId(userId),
    });
    if (doc.supersedesId) {
      await this.decisions.updateOne(
        { _id: doc.supersedesId, workspaceId: new Types.ObjectId(workspaceId) },
        { $set: { status: 'superseded' } },
      );
    }
    this.emit(workspaceId, 'decision.updated', { decision: this.decisionView(doc) }, userId);
    return doc;
  }

  async updateDecision(
    workspaceId: string,
    decisionId: string,
    userId: string,
    patch: Partial<{ title: string; context: string; decision: string; status: DecisionStatus }>,
  ): Promise<DecisionDocument> {
    const doc = await this.findDecision(workspaceId, decisionId);
    if (patch.title !== undefined) doc.title = patch.title.trim();
    if (patch.context !== undefined) doc.context = patch.context.trim();
    if (patch.decision !== undefined) doc.decision = patch.decision.trim();
    if (patch.status !== undefined) {
      if (!DECISION_STATUSES.includes(patch.status)) throw ApiException.validation('Invalid status.');
      doc.status = patch.status;
      if (patch.status === 'accepted' || patch.status === 'rejected') {
        doc.decidedByUserId = new Types.ObjectId(userId);
        doc.decidedAt = new Date();
      }
    }
    await doc.save();
    this.emit(workspaceId, 'decision.updated', { decision: this.decisionView(doc) }, userId);
    return doc;
  }

  async deleteDecision(workspaceId: string, decisionId: string, userId: string): Promise<void> {
    const doc = await this.findDecision(workspaceId, decisionId);
    await this.decisions.deleteOne({ _id: doc._id });
    this.emit(workspaceId, 'decision.updated', { decisionId, deleted: true }, userId);
  }

  private async findDecision(workspaceId: string, decisionId: string): Promise<DecisionDocument> {
    const doc = await this.decisions.findOne({ _id: decisionId, workspaceId: new Types.ObjectId(workspaceId) }).exec();
    if (!doc) throw ApiException.notFound('Decision');
    return doc;
  }

  // ── combined ────────────────────────────────────────────────────────────

  async raid(workspaceId: string, projectId: string): Promise<{ risks: RiskView[]; issues: IssueView[]; decisions: DecisionView[] }> {
    const [risks, issues, decisions] = await Promise.all([
      this.listRisks(workspaceId, projectId),
      this.listIssues(workspaceId, projectId),
      this.listDecisions(workspaceId, projectId),
    ]);
    return {
      risks: risks.map((r) => this.riskView(r)),
      issues: issues.map((i) => this.issueView(i)),
      decisions: decisions.map((d) => this.decisionView(d)),
    };
  }

  private emit(workspaceId: string, event: 'risk.updated' | 'issue.updated' | 'decision.updated', payload: unknown, actorId: string): void {
    this.realtime.emitToWorkspace(workspaceId, event, payload, actorId);
  }

  riskView(r: RiskDocument): RiskView {
    return {
      id: r.id,
      projectId: r.projectId.toString(),
      title: r.title,
      description: r.description,
      probability: r.probability,
      impact: r.impact,
      severity: r.severity,
      status: r.status,
      ownerUserId: r.ownerUserId?.toString() ?? null,
      mitigation: r.mitigation,
      contingency: r.contingency,
      reviewDate: r.reviewDate?.toISOString() ?? null,
      closedAt: r.closedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  }
  issueView(i: IssueDocument): IssueView {
    return {
      id: i.id,
      projectId: i.projectId.toString(),
      title: i.title,
      description: i.description,
      severity: i.severity,
      status: i.status,
      ownerUserId: i.ownerUserId?.toString() ?? null,
      linkedRiskId: i.linkedRiskId?.toString() ?? null,
      linkedTaskId: i.linkedTaskId?.toString() ?? null,
      dueDate: i.dueDate?.toISOString() ?? null,
      resolvedAt: i.resolvedAt?.toISOString() ?? null,
      createdAt: i.createdAt.toISOString(),
    };
  }
  decisionView(d: DecisionDocument): DecisionView {
    return {
      id: d.id,
      projectId: d.projectId.toString(),
      title: d.title,
      context: d.context,
      decision: d.decision,
      status: d.status,
      decidedByUserId: d.decidedByUserId?.toString() ?? null,
      decidedAt: d.decidedAt?.toISOString() ?? null,
      supersedesId: d.supersedesId?.toString() ?? null,
      createdAt: d.createdAt.toISOString(),
    };
  }
}
