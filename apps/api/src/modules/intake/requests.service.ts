import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { TaskPriority } from '@flowdesk/types';
import { ApiException } from '../../common/http/api-exception.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { Request, REQUEST_STATUSES, type RequestDocument, type RequestStatus } from './schemas/request.schema.js';

export interface RequestView {
  id: string;
  title: string;
  description: string;
  status: RequestStatus;
  priority: TaskPriority;
  source: 'form' | 'portal' | 'manual';
  projectId: string | null;
  clientId: string | null;
  requesterName: string;
  requesterEmail: string;
  assigneeUserId: string | null;
  linkedTaskId: string | null;
  createdAt: string;
}

export interface CreateRequestInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  projectId?: string | null;
  clientId?: string | null;
  source?: 'form' | 'portal' | 'manual';
  formId?: string | null;
  formSubmissionId?: string | null;
  requesterUserId?: string | null;
  requesterName?: string;
  requesterEmail?: string;
  assigneeUserId?: string | null;
}

@Injectable()
export class RequestsService {
  constructor(
    @InjectModel(Request.name) private readonly model: Model<RequestDocument>,
    private readonly tasks: TasksService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(workspaceId: string, input: CreateRequestInput): Promise<RequestDocument> {
    const doc = await this.model.create({
      workspaceId: new Types.ObjectId(workspaceId),
      title: input.title.trim(),
      description: input.description?.trim() ?? '',
      priority: input.priority ?? 'medium',
      source: input.source ?? 'manual',
      projectId: input.projectId ? new Types.ObjectId(input.projectId) : null,
      clientId: input.clientId ? new Types.ObjectId(input.clientId) : null,
      formId: input.formId ? new Types.ObjectId(input.formId) : null,
      formSubmissionId: input.formSubmissionId ? new Types.ObjectId(input.formSubmissionId) : null,
      requesterUserId: input.requesterUserId ? new Types.ObjectId(input.requesterUserId) : null,
      requesterName: input.requesterName ?? '',
      requesterEmail: input.requesterEmail?.toLowerCase() ?? '',
      assigneeUserId: input.assigneeUserId ? new Types.ObjectId(input.assigneeUserId) : null,
    });
    this.realtime.emitToWorkspace(workspaceId, 'request.created', { request: this.toView(doc) }, null);
    if (doc.assigneeUserId) {
      await this.notifications.notify([doc.assigneeUserId.toString()], {
        workspaceId,
        type: 'request.assigned',
        title: `New request: ${doc.title}`,
        projectId: doc.projectId?.toString() ?? null,
        entityType: 'request',
        entityId: doc.id,
      });
    }
    return doc;
  }

  list(workspaceId: string, opts: { status?: RequestStatus; clientId?: string } = {}): Promise<RequestDocument[]> {
    const filter: Record<string, unknown> = { workspaceId: new Types.ObjectId(workspaceId) };
    if (opts.status) filter.status = opts.status;
    if (opts.clientId) filter.clientId = new Types.ObjectId(opts.clientId);
    return this.model.find(filter).sort({ createdAt: -1 }).limit(300).exec();
  }

  async getOrThrow(workspaceId: string, requestId: string): Promise<RequestDocument> {
    const doc = await this.model.findOne({ _id: requestId, workspaceId: new Types.ObjectId(workspaceId) }).exec();
    if (!doc) throw ApiException.notFound('Request');
    return doc;
  }

  async update(
    workspaceId: string,
    requestId: string,
    patch: Partial<{ title: string; description: string; status: RequestStatus; priority: TaskPriority; projectId: string | null; assigneeUserId: string | null }>,
    actorId: string,
  ): Promise<RequestDocument> {
    const doc = await this.getOrThrow(workspaceId, requestId);
    if (patch.title !== undefined) doc.title = patch.title.trim();
    if (patch.description !== undefined) doc.description = patch.description.trim();
    if (patch.status !== undefined) {
      if (!REQUEST_STATUSES.includes(patch.status)) throw ApiException.validation('Invalid status.');
      doc.status = patch.status;
    }
    if (patch.priority !== undefined) doc.priority = patch.priority;
    if (patch.projectId !== undefined) doc.projectId = patch.projectId ? new Types.ObjectId(patch.projectId) : null;
    if (patch.assigneeUserId !== undefined) {
      doc.assigneeUserId = patch.assigneeUserId ? new Types.ObjectId(patch.assigneeUserId) : null;
      if (doc.assigneeUserId) {
        await this.notifications.notify([doc.assigneeUserId.toString()], {
          workspaceId,
          type: 'request.assigned',
          title: `Request assigned to you: ${doc.title}`,
          actorUserId: actorId,
          entityType: 'request',
          entityId: doc.id,
        });
      }
    }
    await doc.save();
    this.realtime.emitToWorkspace(workspaceId, 'request.updated', { request: this.toView(doc) }, actorId);
    return doc;
  }

  async convertToTask(
    workspaceId: string,
    requestId: string,
    userId: string,
    opts: { projectId: string; columnId?: string },
  ): Promise<{ request: RequestDocument; taskId: string; taskKey: string }> {
    const doc = await this.getOrThrow(workspaceId, requestId);
    if (doc.linkedTaskId) throw ApiException.validation('This request is already linked to a task.');

    const task = await this.tasks.create(workspaceId, userId, {
      projectId: opts.projectId,
      columnId: opts.columnId,
      title: doc.title,
      description: doc.description ? `<p>${doc.description.replace(/\n/g, '<br>')}</p>` : '',
      priority: doc.priority,
      assigneeUserIds: doc.assigneeUserId ? [doc.assigneeUserId.toString()] : [],
    });

    doc.linkedTaskId = task._id as Types.ObjectId;
    doc.status = 'converted';
    doc.projectId = new Types.ObjectId(opts.projectId);
    await doc.save();

    this.realtime.emitToWorkspace(workspaceId, 'request.updated', { request: this.toView(doc) }, userId);
    return { request: doc, taskId: task.id, taskKey: task.key };
  }

  toView(r: RequestDocument): RequestView {
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      status: r.status,
      priority: r.priority,
      source: r.source,
      projectId: r.projectId?.toString() ?? null,
      clientId: r.clientId?.toString() ?? null,
      requesterName: r.requesterName,
      requesterEmail: r.requesterEmail,
      assigneeUserId: r.assigneeUserId?.toString() ?? null,
      linkedTaskId: r.linkedTaskId?.toString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
