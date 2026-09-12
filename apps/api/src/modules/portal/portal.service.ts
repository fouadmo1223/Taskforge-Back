import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { StatusCategory, TaskPriority } from '@flowdesk/types';
import { ApiException } from '../../common/http/api-exception.js';
import { BoardColumn, type BoardColumnDocument } from '../columns/schemas/board-column.schema.js';
import { Task, type TaskDocument } from '../tasks/schemas/task.schema.js';
import { ClientsService } from '../clients/clients.service.js';
import { DeliverablesService, type DeliverableView } from '../deliverables/deliverables.service.js';
import { MilestonesService, type MilestoneView } from '../milestones/milestones.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { ApprovalsService, type ApprovalView } from '../approvals/approvals.service.js';
import { RequestsService, type RequestView } from '../intake/requests.service.js';

export interface PortalTaskView {
  id: string;
  key: string;
  title: string;
  priority: TaskPriority;
  status: string;
  statusCategory: StatusCategory;
  dueDate: string | null;
  updatedAt: string;
}

export interface PortalProjectSummary {
  id: string;
  name: string;
  key: string;
  status: string;
  openTasks: number;
  totalTasks: number;
}

export interface PortalOverview {
  client: { id: string; name: string };
  projects: PortalProjectSummary[];
  pendingApprovals: number;
  openRequests: number;
}

export interface PortalProjectDetail {
  project: PortalProjectSummary;
  tasks: PortalTaskView[];
  milestones: MilestoneView[];
  deliverables: DeliverableView[];
}

@Injectable()
export class PortalService {
  constructor(
    @InjectModel(Task.name) private readonly tasks: Model<TaskDocument>,
    @InjectModel(BoardColumn.name) private readonly columns: Model<BoardColumnDocument>,
    private readonly clients: ClientsService,
    private readonly projects: ProjectsService,
    private readonly milestones: MilestonesService,
    private readonly deliverables: DeliverablesService,
    private readonly approvals: ApprovalsService,
    private readonly requests: RequestsService,
  ) {}

  private async allowedProjectIds(workspaceId: string, clientId: string): Promise<string[]> {
    return this.clients.projectIdsForClient(workspaceId, clientId);
  }

  private async assertProjectAllowed(workspaceId: string, clientId: string, projectId: string): Promise<void> {
    const allowed = await this.allowedProjectIds(workspaceId, clientId);
    if (!allowed.includes(projectId)) throw ApiException.notFound('Project');
  }

  async overview(workspaceId: string, clientId: string, userId: string): Promise<PortalOverview> {
    const client = await this.clients.getOrThrow(workspaceId, clientId);
    const projectIds = client.projectIds.map((id) => id.toString());

    const summaries = await Promise.all(projectIds.map((id) => this.projectSummary(workspaceId, id)));
    const [pending, requests] = await Promise.all([
      this.approvals.listMinePending(workspaceId, userId),
      this.requests.list(workspaceId, { clientId }),
    ]);

    return {
      client: { id: client.id, name: client.name },
      projects: summaries.filter((s): s is PortalProjectSummary => s !== null),
      pendingApprovals: pending.length,
      openRequests: requests.filter((r) => !['declined', 'converted'].includes(r.status)).length,
    };
  }

  async projectDetail(workspaceId: string, clientId: string, projectId: string): Promise<PortalProjectDetail> {
    await this.assertProjectAllowed(workspaceId, clientId, projectId);
    const summary = await this.projectSummary(workspaceId, projectId);
    if (!summary) throw ApiException.notFound('Project');

    const [tasks, milestoneDocs, deliverables] = await Promise.all([
      this.clientVisibleTasks(workspaceId, projectId),
      this.milestones.listForProject(projectId),
      this.deliverables.list(workspaceId, { projectId, clientVisibleOnly: true }),
    ]);
    const milestones = await Promise.all(milestoneDocs.map((m) => this.milestones.toView(m)));

    return {
      project: summary,
      tasks,
      milestones,
      deliverables: deliverables.map((d) => this.deliverables.toView(d)),
    };
  }

  async deliverablesForClient(workspaceId: string, clientId: string): Promise<DeliverableView[]> {
    const projectIds = await this.allowedProjectIds(workspaceId, clientId);
    if (projectIds.length === 0) return [];
    const rows = await this.deliverables.list(workspaceId, { clientVisibleOnly: true });
    return rows
      .filter((d) => projectIds.includes(d.projectId.toString()))
      .map((d) => this.deliverables.toView(d));
  }

  async approvalsForClient(workspaceId: string, userId: string): Promise<ApprovalView[]> {
    return (await this.approvals.listMinePending(workspaceId, userId)).map((a) => this.approvals.toView(a));
  }

  async requestsForClient(workspaceId: string, clientId: string): Promise<RequestView[]> {
    return (await this.requests.list(workspaceId, { clientId })).map((r) => this.requests.toView(r));
  }

  async createRequest(
    workspaceId: string,
    clientId: string,
    userId: string,
    input: { title: string; description?: string; projectId?: string },
  ): Promise<RequestView> {
    if (input.projectId) await this.assertProjectAllowed(workspaceId, clientId, input.projectId);
    const doc = await this.requests.create(workspaceId, {
      title: input.title,
      description: input.description,
      source: 'portal',
      clientId,
      projectId: input.projectId ?? null,
      requesterUserId: userId,
    });
    return this.requests.toView(doc);
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private async projectSummary(workspaceId: string, projectId: string): Promise<PortalProjectSummary | null> {
    const project = await this.projects.getOrThrow(workspaceId, projectId).catch(() => null);
    if (!project) return null;

    const doneColumnIds = (
      await this.columns.find({ projectId: new Types.ObjectId(projectId), statusCategory: { $in: ['done', 'cancelled'] } }).select('_id').lean()
    ).map((c) => c._id);

    const [total, open] = await Promise.all([
      this.tasks.countDocuments({
        projectId: new Types.ObjectId(projectId),
        clientVisible: true,
        deletedAt: null,
      }),
      this.tasks.countDocuments({
        projectId: new Types.ObjectId(projectId),
        clientVisible: true,
        deletedAt: null,
        columnId: { $nin: doneColumnIds },
      }),
    ]);

    return {
      id: project.id,
      name: project.name,
      key: project.key,
      status: project.status,
      openTasks: open,
      totalTasks: total,
    };
  }

  private async clientVisibleTasks(workspaceId: string, projectId: string): Promise<PortalTaskView[]> {
    const rows = await this.tasks
      .find({
        workspaceId: new Types.ObjectId(workspaceId),
        projectId: new Types.ObjectId(projectId),
        clientVisible: true,
        deletedAt: null,
      })
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean();

    const columnIds = [...new Set(rows.map((r) => r.columnId.toString()))];
    const cols = await this.columns.find({ _id: { $in: columnIds } }).select('name statusCategory').lean();
    const colMap = new Map(cols.map((c) => [c._id.toString(), c]));

    return rows.map((r) => {
      const col = colMap.get(r.columnId.toString());
      return {
        id: r._id.toString(),
        key: r.key,
        title: r.title,
        priority: r.priority,
        status: col?.name ?? 'Unknown',
        statusCategory: (col?.statusCategory ?? 'todo') as StatusCategory,
        dueDate: r.dueDate ? new Date(r.dueDate).toISOString() : null,
        updatedAt: new Date(r.updatedAt as Date).toISOString(),
      };
    });
  }
}
