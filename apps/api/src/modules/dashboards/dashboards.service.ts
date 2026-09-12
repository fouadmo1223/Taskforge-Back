import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { DashboardWidgetType } from '@flowdesk/types';
import { ApiException } from '../../common/http/api-exception.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { Task, type TaskDocument } from '../tasks/schemas/task.schema.js';
import { ReportsService } from '../reports/reports.service.js';
import { Dashboard, type DashboardDocument } from './schemas/dashboard.schema.js';

export interface WidgetInput {
  type: DashboardWidgetType;
  title: string;
  source: string;
  config?: Record<string, unknown>;
  layout?: { x: number; y: number; w: number; h: number };
}

export interface DashboardView {
  id: string;
  name: string;
  ownerUserId: string;
  shared: boolean;
  widgets: Array<{
    id: string;
    type: DashboardWidgetType;
    title: string;
    source: string;
    config: Record<string, unknown>;
    layout: { x: number; y: number; w: number; h: number };
  }>;
  createdAt: string;
}

export interface RenderedDashboard extends DashboardView {
  data: Record<string, unknown>;
}

@Injectable()
export class DashboardsService {
  constructor(
    @InjectModel(Dashboard.name) private readonly model: Model<DashboardDocument>,
    @InjectModel(Task.name) private readonly tasks: Model<TaskDocument>,
    private readonly reports: ReportsService,
    private readonly realtime: RealtimeService,
  ) {}

  list(workspaceId: string, userId: string): Promise<DashboardDocument[]> {
    return this.model
      .find({
        workspaceId: new Types.ObjectId(workspaceId),
        $or: [{ ownerUserId: new Types.ObjectId(userId) }, { shared: true }],
      })
      .sort({ name: 1 })
      .exec();
  }

  async getOrThrow(workspaceId: string, id: string): Promise<DashboardDocument> {
    const doc = await this.model.findOne({ _id: id, workspaceId: new Types.ObjectId(workspaceId) }).exec();
    if (!doc) throw ApiException.notFound('Dashboard');
    return doc;
  }

  private assertOwner(doc: DashboardDocument, userId: string): void {
    if (doc.ownerUserId.toString() !== userId) throw ApiException.forbidden('Only the dashboard owner can change it.');
  }

  create(
    workspaceId: string,
    userId: string,
    input: { name: string; shared?: boolean; widgets?: WidgetInput[] },
  ): Promise<DashboardDocument> {
    return this.model.create({
      workspaceId: new Types.ObjectId(workspaceId),
      name: input.name.trim(),
      ownerUserId: new Types.ObjectId(userId),
      shared: input.shared ?? false,
      widgets: (input.widgets ?? []).map((w) => this.normalizeWidget(w)),
    });
  }

  async update(
    workspaceId: string,
    id: string,
    userId: string,
    patch: Partial<{ name: string; shared: boolean; widgets: WidgetInput[] }>,
  ): Promise<DashboardDocument> {
    const doc = await this.getOrThrow(workspaceId, id);
    this.assertOwner(doc, userId);
    if (patch.name !== undefined) doc.name = patch.name.trim();
    if (patch.shared !== undefined) doc.shared = patch.shared;
    if (patch.widgets !== undefined) {
      doc.widgets = patch.widgets.map((w) => this.normalizeWidget(w)) as DashboardDocument['widgets'];
    }
    await doc.save();
    this.realtime.emitToWorkspace(workspaceId, 'dashboard.updated', { dashboard: this.toView(doc) }, userId);
    return doc;
  }

  async remove(workspaceId: string, id: string, userId: string): Promise<void> {
    const doc = await this.getOrThrow(workspaceId, id);
    this.assertOwner(doc, userId);
    await this.model.deleteOne({ _id: doc._id });
  }

  async render(workspaceId: string, id: string): Promise<RenderedDashboard> {
    const doc = await this.getOrThrow(workspaceId, id);
    const data: Record<string, unknown> = {};
    for (const widget of doc.widgets) {
      data[widget._id.toString()] = await this.computeWidget(workspaceId, widget.source, widget.config);
    }
    return { ...this.toView(doc), data };
  }

  private async computeWidget(
    workspaceId: string,
    source: string,
    config: Record<string, unknown>,
  ): Promise<unknown> {
    const projectId = typeof config.projectId === 'string' ? config.projectId : undefined;
    switch (source) {
      case 'task_count': {
        const match: Record<string, unknown> = { workspaceId: new Types.ObjectId(workspaceId), deletedAt: null, archivedAt: null };
        if (projectId) match.projectId = new Types.ObjectId(projectId);
        if (config.overdueOnly) match.dueDate = { $lt: new Date(), $ne: null };
        return { value: await this.tasks.countDocuments(match) };
      }
      case 'project_status':
        return this.reports.projectStatus(workspaceId, projectId ? [projectId] : undefined);
      case 'throughput':
        return this.reports.throughput(workspaceId, projectId, Math.max(1, Math.min(26, Number(config.weeks) || 8)));
      case 'priority_breakdown':
        return this.reports.priorityBreakdown(workspaceId, projectId);
      default:
        return null;
    }
  }

  private normalizeWidget(w: WidgetInput): DashboardDocument['widgets'][number] {
    return {
      _id: new Types.ObjectId(),
      type: w.type,
      title: w.title.trim(),
      source: w.source,
      config: w.config ?? {},
      layout: w.layout ?? { x: 0, y: 0, w: 4, h: 3 },
    } as DashboardDocument['widgets'][number];
  }

  toView(d: DashboardDocument): DashboardView {
    return {
      id: d.id,
      name: d.name,
      ownerUserId: d.ownerUserId.toString(),
      shared: d.shared,
      widgets: d.widgets.map((w) => ({
        id: w._id.toString(),
        type: w.type,
        title: w.title,
        source: w.source,
        config: w.config,
        layout: w.layout,
      })),
      createdAt: d.createdAt.toISOString(),
    };
  }
}
