import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { OffsetPage } from '@flowdesk/types';
import { offsetPage } from '../../common/db/pagination.js';
import { ApiException } from '../../common/http/api-exception.js';
import { Workspace, type WorkspaceDocument } from '../workspaces/schemas/workspace.schema.js';
import { User, type UserDocument } from '../users/schemas/user.schema.js';
import { Project, type ProjectDocument } from '../projects/schemas/project.schema.js';
import { WorkspaceMembership, type WorkspaceMembershipDocument } from '../memberships/schemas/workspace-membership.schema.js';
import type { AdminListWorkspacesQueryDto } from './dto/admin.dto.js';

export interface AdminWorkspaceListItem {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  ownerName: string | null;
  memberCount: number;
  projectCount: number;
  createdAt: string;
}

export interface AdminWorkspaceDetail extends AdminWorkspaceListItem {
  ownerEmail: string | null;
}

@Injectable()
export class AdminWorkspacesService {
  constructor(
    @InjectModel(Workspace.name) private readonly workspaces: Model<WorkspaceDocument>,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectModel(Project.name) private readonly projects: Model<ProjectDocument>,
    @InjectModel(WorkspaceMembership.name) private readonly memberships: Model<WorkspaceMembershipDocument>,
  ) {}

  async list(query: AdminListWorkspacesQueryDto): Promise<OffsetPage<AdminWorkspaceListItem>> {
    const filter: Record<string, unknown> = { deletedAt: null };
    if (query.search?.trim()) {
      const re = new RegExp(query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: re }, { slug: re }];
    }
    const sortField = query.sort && ['name', 'createdAt'].includes(query.sort) ? query.sort : 'createdAt';
    const sort: Record<string, 1 | -1> = { [sortField]: query.order === 'asc' ? 1 : -1 };

    const [rows, total] = await Promise.all([
      this.workspaces
        .find(filter)
        .sort(sort)
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .exec(),
      this.workspaces.countDocuments(filter),
    ]);

    const ownerIds = [...new Set(rows.map((r) => r.ownerUserId.toString()))].map((id) => new Types.ObjectId(id));
    const owners = await this.users.find({ _id: { $in: ownerIds } }).select('name email').exec();
    const ownerById = new Map(owners.map((o) => [o.id, o]));

    const [memberCounts, projectCounts] = await Promise.all([
      Promise.all(rows.map((r) => this.memberships.countDocuments({ workspaceId: r._id, status: 'active' }))),
      Promise.all(rows.map((r) => this.projects.countDocuments({ workspaceId: r._id, deletedAt: null }))),
    ]);

    const items = rows.map((r, i) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      ownerUserId: r.ownerUserId.toString(),
      ownerName: ownerById.get(r.ownerUserId.toString())?.name ?? null,
      memberCount: memberCounts[i] ?? 0,
      projectCount: projectCounts[i] ?? 0,
      createdAt: r.createdAt.toISOString(),
    }));
    return offsetPage(items, total, query.page, query.pageSize);
  }

  async getById(id: string): Promise<AdminWorkspaceDetail> {
    if (!Types.ObjectId.isValid(id)) throw ApiException.notFound('Workspace');
    const ws = await this.workspaces.findOne({ _id: id, deletedAt: null }).exec();
    if (!ws) throw ApiException.notFound('Workspace');
    const owner = await this.users.findById(ws.ownerUserId).select('name email').exec();
    const [memberCount, projectCount] = await Promise.all([
      this.memberships.countDocuments({ workspaceId: ws._id, status: 'active' }),
      this.projects.countDocuments({ workspaceId: ws._id, deletedAt: null }),
    ]);
    return {
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
      ownerUserId: ws.ownerUserId.toString(),
      ownerName: owner?.name ?? null,
      ownerEmail: owner?.email ?? null,
      memberCount,
      projectCount,
      createdAt: ws.createdAt.toISOString(),
    };
  }
}
