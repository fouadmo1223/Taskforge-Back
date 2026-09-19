import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { OffsetPage } from '@flowdesk/types';
import { offsetPage } from '../../common/db/pagination.js';
import { ApiException } from '../../common/http/api-exception.js';
import { UsersService } from '../users/users.service.js';
import { User, type UserDocument } from '../users/schemas/user.schema.js';
import { WorkspaceMembership, type WorkspaceMembershipDocument } from '../memberships/schemas/workspace-membership.schema.js';
import { Project, type ProjectDocument } from '../projects/schemas/project.schema.js';
import { Task, type TaskDocument } from '../tasks/schemas/task.schema.js';
import { Workspace, type WorkspaceDocument } from '../workspaces/schemas/workspace.schema.js';
import type { AdminListUsersQueryDto } from './dto/admin.dto.js';

export interface AdminUserListItem {
  id: string;
  name: string;
  email: string;
  avatar: UserDocument['avatar'];
  emailVerified: boolean;
  isSuspended: boolean;
  isPlatformAdmin: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminUserDetail extends AdminUserListItem {
  bannedAt: string | null;
  banReason: string | null;
  verifiedByAdminAt: string | null;
  updatedAt: string;
  stats: {
    workspacesOwned: number;
    memberships: number;
    projectsCreated: number;
    tasksCreated: number;
    tasksAssigned: number;
  };
}

function toListItem(u: UserDocument): AdminUserListItem {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatar: u.avatar,
    emailVerified: u.emailVerified,
    isSuspended: u.isSuspended,
    isPlatformAdmin: u.isPlatformAdmin,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  };
}

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectModel(WorkspaceMembership.name) private readonly memberships: Model<WorkspaceMembershipDocument>,
    @InjectModel(Project.name) private readonly projects: Model<ProjectDocument>,
    @InjectModel(Task.name) private readonly tasks: Model<TaskDocument>,
    @InjectModel(Workspace.name) private readonly workspaces: Model<WorkspaceDocument>,
    private readonly usersService: UsersService,
  ) {}

  async list(query: AdminListUsersQueryDto): Promise<OffsetPage<AdminUserListItem>> {
    const filter: Record<string, unknown> = {};
    if (query.search?.trim()) {
      const re = new RegExp(query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: re }, { email: re }];
    }
    if (query.verification === 'verified') filter.emailVerified = true;
    if (query.verification === 'unverified') filter.emailVerified = false;
    if (query.status === 'active') filter.isSuspended = false;
    if (query.status === 'banned') filter.isSuspended = true;

    const sortField = query.sort && ['name', 'email', 'createdAt', 'lastLoginAt'].includes(query.sort) ? query.sort : 'createdAt';
    const sort: Record<string, 1 | -1> = { [sortField]: query.order === 'asc' ? 1 : -1 };

    const [rows, total] = await Promise.all([
      this.users
        .find(filter)
        .sort(sort)
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .exec(),
      this.users.countDocuments(filter),
    ]);
    return offsetPage(rows.map(toListItem), total, query.page, query.pageSize);
  }

  async getById(id: string): Promise<AdminUserDetail> {
    if (!Types.ObjectId.isValid(id)) throw ApiException.notFound('User');
    const user = await this.usersService.getByIdOrThrow(id);
    const uid = new Types.ObjectId(id);

    const [workspacesOwned, memberships, projectsCreated, tasksCreated, tasksAssigned] = await Promise.all([
      this.workspaces.countDocuments({ ownerUserId: uid, deletedAt: null }),
      this.memberships.countDocuments({ userId: uid }),
      this.projects.countDocuments({ createdByUserId: uid, deletedAt: null }),
      this.tasks.countDocuments({ createdByUserId: uid, deletedAt: null }),
      this.tasks.countDocuments({ assigneeUserIds: uid, deletedAt: null }),
    ]);

    return {
      ...toListItem(user),
      bannedAt: user.bannedAt?.toISOString() ?? null,
      banReason: user.banReason,
      verifiedByAdminAt: user.verifiedByAdminAt?.toISOString() ?? null,
      updatedAt: user.updatedAt.toISOString(),
      stats: { workspacesOwned, memberships, projectsCreated, tasksCreated, tasksAssigned },
    };
  }
}
