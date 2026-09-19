import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, type UserDocument } from '../users/schemas/user.schema.js';
import { Workspace, type WorkspaceDocument } from '../workspaces/schemas/workspace.schema.js';
import { Project, type ProjectDocument } from '../projects/schemas/project.schema.js';
import { Task, type TaskDocument } from '../tasks/schemas/task.schema.js';

export interface AdminDashboardStats {
  users: { total: number; verified: number; unverified: number; banned: number; newLast7Days: number };
  workspaces: { total: number };
  projects: { total: number; archived: number };
  tasks: { total: number; completed: number };
}

const DAY_MS = 86_400_000;

@Injectable()
export class AdminStatsService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectModel(Workspace.name) private readonly workspaces: Model<WorkspaceDocument>,
    @InjectModel(Project.name) private readonly projects: Model<ProjectDocument>,
    @InjectModel(Task.name) private readonly tasks: Model<TaskDocument>,
  ) {}

  async dashboard(): Promise<AdminDashboardStats> {
    const since7d = new Date(Date.now() - 7 * DAY_MS);

    const [
      totalUsers,
      verifiedUsers,
      bannedUsers,
      newUsersLast7Days,
      totalWorkspaces,
      totalProjects,
      archivedProjects,
      totalTasks,
      completedTasks,
    ] = await Promise.all([
      this.users.countDocuments({}),
      this.users.countDocuments({ emailVerified: true }),
      this.users.countDocuments({ isSuspended: true }),
      this.users.countDocuments({ createdAt: { $gte: since7d } }),
      this.workspaces.countDocuments({ deletedAt: null }),
      this.projects.countDocuments({ deletedAt: null }),
      this.projects.countDocuments({ deletedAt: null, archivedAt: { $ne: null } }),
      this.tasks.countDocuments({ deletedAt: null }),
      this.tasks.countDocuments({ deletedAt: null, completedAt: { $ne: null } }),
    ]);

    return {
      users: {
        total: totalUsers,
        verified: verifiedUsers,
        unverified: totalUsers - verifiedUsers,
        banned: bannedUsers,
        newLast7Days: newUsersLast7Days,
      },
      workspaces: { total: totalWorkspaces },
      projects: { total: totalProjects, archived: archivedProjects },
      tasks: { total: totalTasks, completed: completedTasks },
    };
  }
}
