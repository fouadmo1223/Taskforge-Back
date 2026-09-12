import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ApiException } from '../../common/http/api-exception.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { Team, type TeamDocument } from './schemas/team.schema.js';

export interface TeamView {
  id: string;
  name: string;
  description: string;
  color: string;
  leadUserId: string | null;
  memberUserIds: string[];
  archived: boolean;
  createdAt: string;
}

@Injectable()
export class TeamsService {
  constructor(
    @InjectModel(Team.name) private readonly model: Model<TeamDocument>,
    private readonly realtime: RealtimeService,
  ) {}

  list(workspaceId: string, includeArchived = false): Promise<TeamDocument[]> {
    const filter: Record<string, unknown> = { workspaceId: new Types.ObjectId(workspaceId) };
    if (!includeArchived) filter.archivedAt = null;
    return this.model.find(filter).sort({ name: 1 }).exec();
  }

  /** Team ids a user belongs to (active teams only). */
  async teamIdsForUser(workspaceId: string, userId: string): Promise<string[]> {
    const rows = await this.model
      .find({ workspaceId: new Types.ObjectId(workspaceId), archivedAt: null, memberUserIds: new Types.ObjectId(userId) })
      .select('_id')
      .lean();
    return rows.map((r) => r._id.toString());
  }

  async getOrThrow(workspaceId: string, id: string): Promise<TeamDocument> {
    const doc = await this.model.findOne({ _id: id, workspaceId: new Types.ObjectId(workspaceId) }).exec();
    if (!doc) throw ApiException.notFound('Team');
    return doc;
  }

  async create(
    workspaceId: string,
    userId: string,
    input: { name: string; description?: string; color?: string; leadUserId?: string | null; memberUserIds?: string[] },
  ): Promise<TeamDocument> {
    const members = new Set(input.memberUserIds ?? []);
    if (input.leadUserId) members.add(input.leadUserId);
    const doc = await this.model.create({
      workspaceId: new Types.ObjectId(workspaceId),
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      color: input.color ?? '#0ea5e9',
      leadUserId: input.leadUserId ? new Types.ObjectId(input.leadUserId) : null,
      memberUserIds: [...members].map((id) => new Types.ObjectId(id)),
      createdByUserId: new Types.ObjectId(userId),
    });
    this.emit(workspaceId, doc, userId);
    return doc;
  }

  async update(
    workspaceId: string,
    id: string,
    userId: string,
    patch: Partial<{ name: string; description: string; color: string; leadUserId: string | null; memberUserIds: string[]; archived: boolean }>,
  ): Promise<TeamDocument> {
    const doc = await this.getOrThrow(workspaceId, id);
    if (patch.name !== undefined) doc.name = patch.name.trim();
    if (patch.description !== undefined) doc.description = patch.description.trim();
    if (patch.color !== undefined) doc.color = patch.color;
    if (patch.leadUserId !== undefined) doc.leadUserId = patch.leadUserId ? new Types.ObjectId(patch.leadUserId) : null;
    if (patch.memberUserIds !== undefined) {
      const members = new Set(patch.memberUserIds);
      if (doc.leadUserId) members.add(doc.leadUserId.toString());
      doc.memberUserIds = [...members].map((x) => new Types.ObjectId(x));
    }
    if (patch.archived !== undefined) doc.archivedAt = patch.archived ? new Date() : null;
    await doc.save();
    this.emit(workspaceId, doc, userId);
    return doc;
  }

  async remove(workspaceId: string, id: string, userId: string): Promise<void> {
    const doc = await this.getOrThrow(workspaceId, id);
    await this.model.deleteOne({ _id: doc._id });
    this.realtime.emitToWorkspace(workspaceId, 'team.updated', { teamId: id, deleted: true }, userId);
  }

  private emit(workspaceId: string, doc: TeamDocument, actorId: string): void {
    this.realtime.emitToWorkspace(workspaceId, 'team.updated', { team: this.toView(doc) }, actorId);
  }

  toView(t: TeamDocument): TeamView {
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      color: t.color,
      leadUserId: t.leadUserId?.toString() ?? null,
      memberUserIds: t.memberUserIds.map((id) => id.toString()),
      archived: t.archivedAt !== null,
      createdAt: t.createdAt.toISOString(),
    };
  }
}
