import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { Workspace, WorkspaceSchema } from '../workspaces/schemas/workspace.schema.js';
import { Task, TaskSchema } from '../tasks/schemas/task.schema.js';
import { WorkspaceMembership, WorkspaceMembershipSchema } from '../memberships/schemas/workspace-membership.schema.js';
import { AdminStatsController } from './admin-stats.controller.js';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminWorkspacesController } from './admin-workspaces.controller.js';
import { AdminProjectsController } from './admin-projects.controller.js';
import { AdminStatsService } from './admin-stats.service.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminWorkspacesService } from './admin-workspaces.service.js';
import { AdminProjectsService } from './admin-projects.service.js';

/**
 * Platform-wide admin API — cross-workspace, gated by `PlatformAdminGuard` (a `User.
 * isPlatformAdmin` flag), never by `WorkspaceGuard`/`PermissionsGuard`. Reads existing
 * Workspace/Project/Task/WorkspaceMembership models directly, the same cross-module
 * model-injection style already used by ReportsService/DashboardsService — no new
 * schemas of its own except what's needed on User (see users/schemas/user.schema.ts).
 */
@Module({
  imports: [
    UsersModule,
    ProjectsModule,
    MongooseModule.forFeature([
      { name: Workspace.name, schema: WorkspaceSchema },
      { name: Task.name, schema: TaskSchema },
      { name: WorkspaceMembership.name, schema: WorkspaceMembershipSchema },
    ]),
  ],
  controllers: [AdminStatsController, AdminUsersController, AdminWorkspacesController, AdminProjectsController],
  providers: [AdminStatsService, AdminUsersService, AdminWorkspacesService, AdminProjectsService],
})
export class AdminModule {}
