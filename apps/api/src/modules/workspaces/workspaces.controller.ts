import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Membership, RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import type { WorkspaceMembershipContext } from '../../common/context/request-context.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { MembershipsService } from '../memberships/memberships.service.js';
import { CreateWorkspaceDto, UpdateWorkspaceDto } from './dto/workspace.dto.js';
import { WorkspacesService, type WorkspaceView } from './workspaces.service.js';

@ApiTags('workspaces')
@ApiBearerAuth()
@Controller('workspaces')
export class WorkspacesController {
  constructor(
    private readonly workspaces: WorkspacesService,
    private readonly memberships: MembershipsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List workspaces the current user belongs to' })
  async list(@CurrentUser('id') userId: string): Promise<WorkspaceView[]> {
    const views = await this.memberships.listForUser(userId);
    const docs = await this.workspaces.listForUser(views.map((v) => v.workspaceId));
    return docs.map((d) => this.workspaces.serialize(d));
  }

  @Post()
  @ApiOperation({ summary: 'Create a new workspace (creator becomes Owner)' })
  async create(@CurrentUser('id') userId: string, @Body() dto: CreateWorkspaceDto): Promise<WorkspaceView> {
    const ws = await this.workspaces.create(userId, dto);
    return this.workspaces.serialize(ws);
  }

  @Get(':workspaceId')
  @UseGuards(WorkspaceGuard, PermissionsGuard)
  @RequirePermissions('workspace.read')
  @ApiOperation({ summary: 'Get one workspace' })
  async getOne(@Param('workspaceId', ParseObjectIdPipe) workspaceId: string): Promise<WorkspaceView> {
    return this.workspaces.serialize(await this.workspaces.getById(workspaceId));
  }

  @Patch(':workspaceId')
  @UseGuards(WorkspaceGuard, PermissionsGuard)
  @RequirePermissions('workspace.manage')
  @ApiOperation({ summary: 'Update workspace name / settings / branding' })
  async update(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Body() dto: UpdateWorkspaceDto,
  ): Promise<WorkspaceView> {
    return this.workspaces.serialize(await this.workspaces.update(workspaceId, dto));
  }

  @Delete(':workspaceId')
  @UseGuards(WorkspaceGuard, PermissionsGuard)
  @RequirePermissions('workspace.manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Soft-delete a workspace (owner only)' })
  async remove(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Membership() ctx: WorkspaceMembershipContext,
  ): Promise<{ message: string }> {
    await this.workspaces.softDelete(workspaceId, ctx.userId);
    return { message: 'Workspace moved to trash.' };
  }
}
