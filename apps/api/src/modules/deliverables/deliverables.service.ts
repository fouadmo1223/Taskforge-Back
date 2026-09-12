import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { ApprovalStrategy } from '@flowdesk/types';
import { ApiException } from '../../common/http/api-exception.js';
import { CloudinaryService } from '../../infra/cloudinary/cloudinary.service.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { ApprovalsService } from '../approvals/approvals.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import {
  Deliverable,
  DELIVERABLE_STATUSES,
  type DeliverableDocument,
  type DeliverableStatus,
} from './schemas/deliverable.schema.js';

interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export interface DeliverableVersionView {
  id: string;
  version: number;
  url: string;
  format: string;
  bytes: number;
  note: string;
  uploadedByUserId: string;
  approvalId: string | null;
  createdAt: string;
}

export interface DeliverableView {
  id: string;
  projectId: string;
  milestoneId: string | null;
  title: string;
  description: string;
  status: DeliverableStatus;
  clientVisible: boolean;
  dueAt: string | null;
  currentVersion: number;
  versions: DeliverableVersionView[];
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDeliverableInput {
  projectId: string;
  title: string;
  description?: string;
  milestoneId?: string | null;
  clientVisible?: boolean;
  dueAt?: string | null;
}

@Injectable()
export class DeliverablesService {
  constructor(
    @InjectModel(Deliverable.name) private readonly model: Model<DeliverableDocument>,
    private readonly cloudinary: CloudinaryService,
    private readonly projects: ProjectsService,
    private readonly approvals: ApprovalsService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(workspaceId: string, opts: { projectId?: string; clientVisibleOnly?: boolean } = {}): Promise<DeliverableDocument[]> {
    const filter: Record<string, unknown> = { workspaceId: new Types.ObjectId(workspaceId), deletedAt: null };
    if (opts.projectId) filter.projectId = new Types.ObjectId(opts.projectId);
    if (opts.clientVisibleOnly) filter.clientVisible = true;
    return this.model.find(filter).sort({ updatedAt: -1 }).exec();
  }

  async getOrThrow(workspaceId: string, deliverableId: string): Promise<DeliverableDocument> {
    const doc = await this.model
      .findOne({ _id: deliverableId, workspaceId: new Types.ObjectId(workspaceId), deletedAt: null })
      .exec();
    if (!doc) throw ApiException.notFound('Deliverable');
    return doc;
  }

  async create(workspaceId: string, userId: string, input: CreateDeliverableInput): Promise<DeliverableDocument> {
    await this.projects.getOrThrow(workspaceId, input.projectId);
    return this.model.create({
      workspaceId: new Types.ObjectId(workspaceId),
      projectId: new Types.ObjectId(input.projectId),
      milestoneId: input.milestoneId ? new Types.ObjectId(input.milestoneId) : null,
      title: input.title.trim(),
      description: input.description?.trim() ?? '',
      clientVisible: input.clientVisible ?? true,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      createdByUserId: new Types.ObjectId(userId),
    });
  }

  async update(
    workspaceId: string,
    deliverableId: string,
    patch: Partial<{
      title: string;
      description: string;
      status: DeliverableStatus;
      clientVisible: boolean;
      milestoneId: string | null;
      dueAt: string | null;
    }>,
    actorId: string,
  ): Promise<DeliverableDocument> {
    const doc = await this.getOrThrow(workspaceId, deliverableId);
    if (patch.title !== undefined) doc.title = patch.title.trim();
    if (patch.description !== undefined) doc.description = patch.description.trim();
    if (patch.status !== undefined) {
      if (!DELIVERABLE_STATUSES.includes(patch.status)) throw ApiException.validation('Invalid status.');
      doc.status = patch.status;
    }
    if (patch.clientVisible !== undefined) doc.clientVisible = patch.clientVisible;
    if (patch.milestoneId !== undefined) doc.milestoneId = patch.milestoneId ? new Types.ObjectId(patch.milestoneId) : null;
    if (patch.dueAt !== undefined) doc.dueAt = patch.dueAt ? new Date(patch.dueAt) : null;
    await doc.save();
    this.emit(workspaceId, doc, actorId);
    return doc;
  }

  async addVersion(
    workspaceId: string,
    deliverableId: string,
    userId: string,
    file: UploadedFile,
    note?: string,
  ): Promise<DeliverableDocument> {
    const doc = await this.getOrThrow(workspaceId, deliverableId);
    if (!file?.buffer) throw ApiException.validation('No file was uploaded.');

    const asset = await this.cloudinary.upload({
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
      size: file.size,
      uploaderUserId: userId,
      folder: `workspaces/${workspaceId}/deliverables/${deliverableId}`,
    });

    const nextVersion = doc.currentVersion + 1;
    doc.versions.push({
      _id: new Types.ObjectId(),
      version: nextVersion,
      file: { ...asset, uploadedBy: new Types.ObjectId(userId) },
      note: note?.slice(0, 2000) ?? '',
      uploadedByUserId: new Types.ObjectId(userId),
      approvalId: null,
      createdAt: new Date(),
    } as unknown as DeliverableDocument['versions'][number]);
    doc.currentVersion = nextVersion;
    if (doc.status === 'draft') doc.status = 'in_review';
    await doc.save();
    this.emit(workspaceId, doc, userId);
    return doc;
  }

  async requestApproval(
    workspaceId: string,
    deliverableId: string,
    versionId: string,
    userId: string,
    input: { approverUserIds: string[]; strategy: ApprovalStrategy; requiredCount?: number; description?: string },
  ): Promise<DeliverableDocument> {
    const doc = await this.getOrThrow(workspaceId, deliverableId);
    const version = doc.versions.find((v) => v._id.toString() === versionId);
    if (!version) throw ApiException.notFound('Deliverable version');
    if (version.approvalId) throw ApiException.validation('Approval already requested for this version.');

    const approval = await this.approvals.create(workspaceId, userId, {
      subjectType: 'deliverable',
      subjectId: doc.id,
      projectId: doc.projectId.toString(),
      title: `${doc.title} — v${version.version}`,
      description: input.description,
      strategy: input.strategy,
      requiredCount: input.requiredCount,
      approverUserIds: input.approverUserIds,
    });

    version.approvalId = approval._id as Types.ObjectId;
    doc.status = 'in_review';
    await doc.save();
    this.emit(workspaceId, doc, userId);
    return doc;
  }

  async softDelete(workspaceId: string, deliverableId: string, actorId: string): Promise<void> {
    const doc = await this.getOrThrow(workspaceId, deliverableId);
    doc.deletedAt = new Date();
    await doc.save();
    this.realtime.emitToWorkspace(workspaceId, 'deliverable.updated', { deliverableId, deleted: true }, actorId);
  }

  private emit(workspaceId: string, doc: DeliverableDocument, actorId: string): void {
    this.realtime.emitToWorkspace(workspaceId, 'deliverable.updated', { deliverable: this.toView(doc) }, actorId);
  }

  toView(d: DeliverableDocument): DeliverableView {
    return {
      id: d.id,
      projectId: d.projectId.toString(),
      milestoneId: d.milestoneId?.toString() ?? null,
      title: d.title,
      description: d.description,
      status: d.status,
      clientVisible: d.clientVisible,
      dueAt: d.dueAt?.toISOString() ?? null,
      currentVersion: d.currentVersion,
      versions: [...d.versions]
        .sort((a, b) => b.version - a.version)
        .map((v) => ({
          id: v._id.toString(),
          version: v.version,
          url: v.file.secureUrl,
          format: v.file.format,
          bytes: v.file.bytes,
          note: v.note,
          uploadedByUserId: v.uploadedByUserId.toString(),
          approvalId: v.approvalId?.toString() ?? null,
          createdAt: v.createdAt.toISOString(),
        })),
      createdByUserId: d.createdByUserId.toString(),
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    };
  }
}
