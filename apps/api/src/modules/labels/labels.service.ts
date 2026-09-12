import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ApiException } from '../../common/http/api-exception.js';
import { Label, type LabelDocument } from './schemas/label.schema.js';

export interface LabelView {
  id: string;
  name: string;
  color: string;
  projectId: string | null;
}

@Injectable()
export class LabelsService {
  constructor(@InjectModel(Label.name) private readonly model: Model<LabelDocument>) {}

  /** Labels usable in a project = workspace-wide labels + that project's own. */
  async listForProject(workspaceId: string, projectId: string): Promise<LabelDocument[]> {
    return this.model
      .find({
        workspaceId: new Types.ObjectId(workspaceId),
        $or: [{ projectId: null }, { projectId: new Types.ObjectId(projectId) }],
      })
      .sort({ name: 1 })
      .exec();
  }

  listForWorkspace(workspaceId: string): Promise<LabelDocument[]> {
    return this.model.find({ workspaceId: new Types.ObjectId(workspaceId) }).sort({ name: 1 }).exec();
  }

  async create(workspaceId: string, input: { name: string; color?: string; projectId?: string | null }): Promise<LabelDocument> {
    try {
      return await this.model.create({
        workspaceId: new Types.ObjectId(workspaceId),
        projectId: input.projectId ? new Types.ObjectId(input.projectId) : null,
        name: input.name.trim(),
        color: input.color ?? '#64748b',
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw ApiException.conflict('A label with that name already exists.');
      throw err;
    }
  }

  async update(workspaceId: string, labelId: string, patch: { name?: string; color?: string }): Promise<LabelDocument> {
    const label = await this.model.findOneAndUpdate(
      { _id: labelId, workspaceId: new Types.ObjectId(workspaceId) },
      { $set: { ...(patch.name !== undefined ? { name: patch.name.trim() } : {}), ...(patch.color ? { color: patch.color } : {}) } },
      { new: true },
    );
    if (!label) throw ApiException.notFound('Label');
    return label;
  }

  async remove(workspaceId: string, labelId: string): Promise<void> {
    const res = await this.model.deleteOne({ _id: labelId, workspaceId: new Types.ObjectId(workspaceId) });
    if (res.deletedCount === 0) throw ApiException.notFound('Label');
  }

  /** Validate the given label ids all belong to the workspace; returns ObjectIds. */
  async assertValid(workspaceId: string, labelIds: string[]): Promise<Types.ObjectId[]> {
    if (labelIds.length === 0) return [];
    const ids = [...new Set(labelIds)].map((id) => new Types.ObjectId(id));
    const count = await this.model.countDocuments({ _id: { $in: ids }, workspaceId: new Types.ObjectId(workspaceId) });
    if (count !== ids.length) throw ApiException.validation('One or more labels are invalid for this workspace.');
    return ids;
  }

  toView(label: LabelDocument): LabelView {
    return { id: label.id, name: label.name, color: label.color, projectId: label.projectId?.toString() ?? null };
  }
}
