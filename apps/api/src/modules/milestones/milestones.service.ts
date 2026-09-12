import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { MilestoneStatus } from '@flowdesk/types';
import { ApiException } from '../../common/http/api-exception.js';
import { Task, type TaskDocument } from '../tasks/schemas/task.schema.js';
import { Milestone, type MilestoneDocument } from './schemas/milestone.schema.js';

export interface MilestoneView {
  id: string;
  projectId: string;
  name: string;
  description: string;
  ownerUserId: string | null;
  date: string;
  status: MilestoneStatus;
  taskIds: string[];
  progress: { done: number; total: number };
}

@Injectable()
export class MilestonesService {
  constructor(
    @InjectModel(Milestone.name) private readonly model: Model<MilestoneDocument>,
    @InjectModel(Task.name) private readonly tasks: Model<TaskDocument>,
  ) {}

  listForProject(projectId: string): Promise<MilestoneDocument[]> {
    return this.model
      .find({ projectId: new Types.ObjectId(projectId), deletedAt: null })
      .sort({ date: 1 })
      .exec();
  }

  async getOrThrow(workspaceId: string, milestoneId: string): Promise<MilestoneDocument> {
    const m = await this.model
      .findOne({ _id: milestoneId, workspaceId: new Types.ObjectId(workspaceId), deletedAt: null })
      .exec();
    if (!m) throw ApiException.notFound('Milestone');
    return m;
  }

  create(
    workspaceId: string,
    projectId: string,
    input: { name: string; date: string; description?: string; ownerUserId?: string | null },
  ): Promise<MilestoneDocument> {
    return this.model.create({
      workspaceId: new Types.ObjectId(workspaceId),
      projectId: new Types.ObjectId(projectId),
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      ownerUserId: input.ownerUserId ? new Types.ObjectId(input.ownerUserId) : null,
      date: new Date(input.date),
    });
  }

  async update(
    workspaceId: string,
    milestoneId: string,
    patch: Partial<{ name: string; description: string; ownerUserId: string | null; date: string; status: MilestoneStatus }>,
  ): Promise<MilestoneDocument> {
    const m = await this.getOrThrow(workspaceId, milestoneId);
    if (patch.name !== undefined) m.name = patch.name.trim();
    if (patch.description !== undefined) m.description = patch.description.trim();
    if (patch.ownerUserId !== undefined) m.ownerUserId = patch.ownerUserId ? new Types.ObjectId(patch.ownerUserId) : null;
    if (patch.date !== undefined) m.date = new Date(patch.date);
    if (patch.status !== undefined) m.status = patch.status;
    await m.save();
    return m;
  }

  async setTasks(workspaceId: string, milestoneId: string, taskIds: string[]): Promise<MilestoneDocument> {
    const m = await this.getOrThrow(workspaceId, milestoneId);
    const ids = [...new Set(taskIds)].map((id) => new Types.ObjectId(id));
    if (ids.length) {
      const count = await this.tasks.countDocuments({ _id: { $in: ids }, projectId: m.projectId, deletedAt: null });
      if (count !== ids.length) throw ApiException.validation('One or more tasks are not in this project.');
    }
    const prev = new Set(m.taskIds.map((id) => id.toString()));
    m.taskIds = ids;
    await m.save();
    // keep task.milestoneId in sync
    await this.tasks.updateMany({ _id: { $in: ids } }, { $set: { milestoneId: m._id } });
    const removed = [...prev].filter((id) => !ids.some((x) => x.toString() === id));
    if (removed.length) {
      await this.tasks.updateMany(
        { _id: { $in: removed.map((id) => new Types.ObjectId(id)) }, milestoneId: m._id },
        { $set: { milestoneId: null } },
      );
    }
    return m;
  }

  async softDelete(workspaceId: string, milestoneId: string): Promise<MilestoneDocument> {
    const m = await this.getOrThrow(workspaceId, milestoneId);
    m.deletedAt = new Date();
    await m.save();
    await this.tasks.updateMany({ milestoneId: m._id }, { $set: { milestoneId: null } });
    return m;
  }

  async toView(m: MilestoneDocument): Promise<MilestoneView> {
    let done = 0;
    const total = m.taskIds.length;
    if (total) {
      done = await this.tasks.countDocuments({ _id: { $in: m.taskIds }, completedAt: { $ne: null }, deletedAt: null });
    }
    return {
      id: m.id,
      projectId: m.projectId.toString(),
      name: m.name,
      description: m.description,
      ownerUserId: m.ownerUserId?.toString() ?? null,
      date: m.date.toISOString(),
      status: m.status,
      taskIds: m.taskIds.map((id) => id.toString()),
      progress: { done, total },
    };
  }
}
