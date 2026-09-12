import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsDateString, IsIn, IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MILESTONE_STATUSES, type MilestoneStatus } from '@flowdesk/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { ActivityService } from '../activity/activity.service.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { MilestonesService, type MilestoneView } from './milestones.service.js';

class CreateMilestoneDto {
  @IsString() @MinLength(1) @MaxLength(160) name!: string;
  @IsDateString() date!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsMongoId() ownerUserId?: string | null;
}
class UpdateMilestoneDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsMongoId() ownerUserId?: string | null;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsIn(MILESTONE_STATUSES as unknown as string[]) status?: MilestoneStatus;
}
class SetTasksDto {
  @IsArray() @IsMongoId({ each: true }) taskIds!: string[];
}

@ApiTags('milestones')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId')
export class MilestonesController {
  constructor(
    private readonly milestones: MilestonesService,
    private readonly activity: ActivityService,
    private readonly realtime: RealtimeService,
  ) {}

  @Get('projects/:projectId/milestones')
  @RequirePermissions('task.read')
  @ApiOperation({ summary: 'List a project’s milestones' })
  async list(@Param('projectId', ParseObjectIdPipe) projectId: string): Promise<MilestoneView[]> {
    const rows = await this.milestones.listForProject(projectId);
    return Promise.all(rows.map((m) => this.milestones.toView(m)));
  }

  @Post('projects/:projectId/milestones')
  @RequirePermissions('milestone.manage')
  @ApiOperation({ summary: 'Create a milestone' })
  async create(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('projectId', ParseObjectIdPipe) projectId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateMilestoneDto,
  ): Promise<MilestoneView> {
    const m = await this.milestones.create(workspaceId, projectId, dto);
    const view = await this.milestones.toView(m);
    this.realtime.emitToWorkspace(workspaceId, 'milestone.updated', { milestone: view, action: 'created' }, userId);
    this.activity.record({
      workspaceId,
      projectId,
      actorUserId: userId,
      verb: 'milestone.created',
      entityType: 'milestone',
      entityId: m.id,
      entityTitle: m.name,
    });
    return view;
  }

  @Patch('milestones/:milestoneId')
  @RequirePermissions('milestone.manage')
  @ApiOperation({ summary: 'Update a milestone' })
  async update(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('milestoneId', ParseObjectIdPipe) milestoneId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateMilestoneDto,
  ): Promise<MilestoneView> {
    const m = await this.milestones.update(workspaceId, milestoneId, dto);
    const view = await this.milestones.toView(m);
    this.realtime.emitToWorkspace(workspaceId, 'milestone.updated', { milestone: view, action: 'updated' }, userId);
    return view;
  }

  @Patch('milestones/:milestoneId/tasks')
  @RequirePermissions('milestone.manage')
  @ApiOperation({ summary: 'Set the tasks linked to a milestone' })
  async setTasks(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('milestoneId', ParseObjectIdPipe) milestoneId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SetTasksDto,
  ): Promise<MilestoneView> {
    const m = await this.milestones.setTasks(workspaceId, milestoneId, dto.taskIds);
    const view = await this.milestones.toView(m);
    this.realtime.emitToWorkspace(workspaceId, 'milestone.updated', { milestone: view, action: 'tasks' }, userId);
    return view;
  }

  @Delete('milestones/:milestoneId')
  @RequirePermissions('milestone.manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a milestone' })
  async remove(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('milestoneId', ParseObjectIdPipe) milestoneId: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ message: string }> {
    const m = await this.milestones.softDelete(workspaceId, milestoneId);
    this.realtime.emitToWorkspace(workspaceId, 'milestone.updated', { milestoneId, action: 'deleted' }, userId);
    return { message: 'Milestone deleted.' };
  }
}
