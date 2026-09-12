import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ApiException } from '../../common/http/api-exception.js';
import { CloudinaryService } from '../../infra/cloudinary/cloudinary.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { Attachment, type AttachmentDocument } from './schemas/attachment.schema.js';

export interface AttachmentView {
  id: string;
  name: string;
  url: string;
  resourceType: string;
  format: string;
  bytes: number;
  width: number | null;
  height: number | null;
  uploaderUserId: string;
  clientVisible: boolean;
  createdAt: string;
}

interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectModel(Attachment.name) private readonly model: Model<AttachmentDocument>,
    private readonly cloudinary: CloudinaryService,
    private readonly tasks: TasksService,
  ) {}

  listForTask(taskId: string): Promise<AttachmentDocument[]> {
    return this.model.find({ taskId: new Types.ObjectId(taskId) }).sort({ createdAt: -1 }).exec();
  }

  async addToTask(
    workspaceId: string,
    userId: string,
    taskId: string,
    file: UploadedFile,
  ): Promise<AttachmentDocument> {
    const task = await this.tasks.getOrThrow(workspaceId, taskId);
    if (!file?.buffer) throw ApiException.validation('No file was uploaded.');

    const asset = await this.cloudinary.upload({
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
      size: file.size,
      uploaderUserId: userId,
      folder: `workspaces/${workspaceId}/tasks/${taskId}`,
    });

    const doc = await this.model.create({
      workspaceId: new Types.ObjectId(workspaceId),
      projectId: task.projectId,
      taskId: task._id,
      name: file.originalname.slice(0, 260),
      asset: { ...asset, uploadedBy: new Types.ObjectId(userId) },
      uploaderUserId: new Types.ObjectId(userId),
      clientVisible: task.clientVisible,
    });
    await this.tasks.bumpCounter(taskId, 'attachmentCount', 1);
    return doc;
  }

  async remove(workspaceId: string, userId: string, attachmentId: string, canModerate: boolean): Promise<AttachmentDocument> {
    const doc = await this.model.findOne({ _id: attachmentId, workspaceId: new Types.ObjectId(workspaceId) }).exec();
    if (!doc) throw ApiException.notFound('Attachment');
    if (doc.uploaderUserId.toString() !== userId && !canModerate) {
      throw ApiException.forbidden('Only the uploader can remove this attachment.');
    }
    await this.cloudinary.destroy(doc.asset.publicId, doc.asset.resourceType);
    await this.model.deleteOne({ _id: doc._id });
    if (doc.taskId) await this.tasks.bumpCounter(doc.taskId.toString(), 'attachmentCount', -1);
    return doc;
  }

  toView(a: AttachmentDocument): AttachmentView {
    return {
      id: a.id,
      name: a.name,
      url: a.asset.secureUrl,
      resourceType: a.asset.resourceType,
      format: a.asset.format,
      bytes: a.asset.bytes,
      width: a.asset.width,
      height: a.asset.height,
      uploaderUserId: a.uploaderUserId.toString(),
      clientVisible: a.clientVisible,
      createdAt: a.createdAt.toISOString(),
    };
  }
}
