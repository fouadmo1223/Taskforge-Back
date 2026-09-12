import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Membership, RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import type { WorkspaceMembershipContext } from '../../common/context/request-context.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { ActivityService } from '../activity/activity.service.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { ArchiveProjectDto, CreateProjectDto, SetProjectAccessDto, UpdateProjectDto } from './dto/project.dto.js';
import { ProjectsService, type ProjectView, type ProjectViewer } from './projects.service.js';

const viewerFrom = (ctx: WorkspaceMembershipContext): ProjectViewer => ({
  userId: ctx.userId,
  isOwner: ctx.isOwner,
  canManageProjects: ctx.isOwner || ctx.permissions.has('project.create'),
});

@ApiTags('projects')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId/projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly activity: ActivityService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  @Get()
  @RequirePermissions('project.read')
  @ApiOperation({ summary: 'List projects in the workspace' })
  async list(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Membership() ctx: WorkspaceMembershipContext,
    @Query('includeArchived') includeArchived?: string,
  ): Promise<ProjectView[]> {
    const docs = await this.projects.list(workspaceId, {
      includeArchived: includeArchived === 'true',
      viewer: viewerFrom(ctx),
    });
    return Promise.all(docs.map((d) => this.projects.serialize(d)));
  }

  @Get(':projectId')
  @RequirePermissions('project.read')
  @ApiOperation({ summary: 'Get one project' })
  async getOne(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('projectId', ParseObjectIdPipe) projectId: string,
    @Membership() ctx: WorkspaceMembershipContext,
  ): Promise<ProjectView> {
    return this.projects.serialize(await this.projects.getOrThrow(workspaceId, projectId, viewerFrom(ctx)));
  }

  @Post()
  @RequirePermissions('project.create')
  @ApiOperation({ summary: 'Create a project (with a default board + columns)' })
  async create(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateProjectDto,
  ): Promise<ProjectView> {
    const project = await this.projects.create(workspaceId, userId, dto);
    const view = await this.projects.serialize(project);
    this.activity.record({
      workspaceId,
      projectId: project.id,
      actorUserId: userId,
      verb: 'project.created',
      entityType: 'project',
      entityId: project.id,
      entityTitle: project.name,
    });
    this.audit.record({ workspaceId, actorUserId: userId, action: 'project.create', entityType: 'project', entityId: project.id, after: { name: project.name, key: project.key } });
    this.realtime.emitToWorkspace(workspaceId, 'project.created', { project: view }, userId);
    return view;
  }

  @Patch(':projectId')
  @RequirePermissions('project.update')
  @ApiOperation({ summary: 'Update project fields' })
  async update(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('projectId', ParseObjectIdPipe) projectId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<ProjectView> {
    const before = await this.projects.getOrThrow(workspaceId, projectId);
    const beforeSnap = { name: before.name, status: before.status };
    const project = await this.projects.update(workspaceId, projectId, dto);
    const view = await this.projects.serialize(project);
    this.activity.record({
      workspaceId,
      projectId,
      actorUserId: userId,
      verb: 'project.updated',
      entityType: 'project',
      entityId: projectId,
      entityTitle: project.name,
      meta: { fields: Object.keys(dto) },
    });
    this.audit.record({ workspaceId, actorUserId: userId, action: 'project.update', entityType: 'project', entityId: projectId, before: beforeSnap, after: { name: project.name, status: project.status } });
    this.realtime.emitToWorkspace(workspaceId, 'project.updated', { project: view }, userId);
    return view;
  }

  @Patch(':projectId/access')
  @RequirePermissions('project.update')
  @ApiOperation({ summary: 'Set who can see this project (visibility / teams / members)' })
  async setAccess(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('projectId', ParseObjectIdPipe) projectId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SetProjectAccessDto,
  ): Promise<ProjectView> {
    const project = await this.projects.setAccess(workspaceId, projectId, dto);
    const view = await this.projects.serialize(project);
    this.realtime.emitToWorkspace(workspaceId, 'project.updated', { project: view }, userId);
    return view;
  }

  @Post(':projectId/archive')
  @RequirePermissions('project.archive')
  @ApiOperation({ summary: 'Archive or unarchive a project' })
  async archive(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('projectId', ParseObjectIdPipe) projectId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ArchiveProjectDto,
  ): Promise<ProjectView> {
    const project = await this.projects.setArchived(workspaceId, projectId, dto.archived);
    this.audit.record({ workspaceId, actorUserId: userId, action: dto.archived ? 'project.archive' : 'project.unarchive', entityType: 'project', entityId: projectId });
    return this.projects.serialize(project);
  }

  @Delete(':projectId')
  @RequirePermissions('project.delete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Soft-delete a project' })
  async remove(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('projectId', ParseObjectIdPipe) projectId: string,
    @Membership() ctx: WorkspaceMembershipContext,
  ): Promise<{ message: string }> {
    await this.projects.softDelete(workspaceId, projectId, ctx.userId);
    this.audit.record({ workspaceId, actorUserId: ctx.userId, action: 'project.delete', entityType: 'project', entityId: projectId });
    return { message: 'Project moved to trash.' };
  }
}
