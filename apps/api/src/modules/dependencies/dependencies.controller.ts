import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsDateString, IsIn, IsMongoId, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { DEPENDENCY_TYPES, type DependencyType } from '@flowdesk/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { ActivityService } from '../activity/activity.service.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { DependenciesService, type DependencyView, type ScheduleImpactRow } from './dependencies.service.js';

class AddDependencyDto {
  @IsMongoId() toTaskId!: string;
  @IsIn(DEPENDENCY_TYPES as unknown as string[]) type!: DependencyType;
}
class ScheduleImpactDto {
  @IsDateString() newFinish!: string;
}
class ShiftRow {
  @IsMongoId() taskId!: string;
  @IsDateString() startDate!: string;
  @IsDateString() dueDate!: string;
}
class ApplyShiftDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ShiftRow)
  shifts!: ShiftRow[];
}

@ApiTags('dependencies')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId')
export class DependenciesController {
  constructor(
    private readonly deps: DependenciesService,
    private readonly activity: ActivityService,
    private readonly realtime: RealtimeService,
  ) {}

  @Get('projects/:projectId/dependencies')
  @RequirePermissions('task.read')
  @ApiOperation({ summary: 'All dependencies in a project (for the timeline)' })
  async listForProject(@Param('projectId', ParseObjectIdPipe) projectId: string): Promise<DependencyView[]> {
    return (await this.deps.listForProject(projectId)).map((d) => this.deps.toView(d));
  }

  @Get('tasks/:taskId/dependencies')
  @RequirePermissions('task.read')
  @ApiOperation({ summary: 'Dependencies touching a task' })
  async listForTask(@Param('taskId', ParseObjectIdPipe) taskId: string): Promise<DependencyView[]> {
    return (await this.deps.listForTask(taskId)).map((d) => this.deps.toView(d));
  }

  @Post('tasks/:taskId/dependencies')
  @RequirePermissions('dependency.manage')
  @ApiOperation({ summary: 'Add a dependency (rejects circular scheduling chains)' })
  async add(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('taskId', ParseObjectIdPipe) taskId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: AddDependencyDto,
  ): Promise<DependencyView> {
    const dep = await this.deps.create(workspaceId, userId, taskId, dto.toTaskId, dto.type);
    const view = this.deps.toView(dep);
    this.realtime.emitToWorkspace(workspaceId, 'dependency.updated', { dependency: view, action: 'added' }, userId);
    this.activity.record({
      workspaceId,
      projectId: dep.projectId.toString(),
      taskId,
      actorUserId: userId,
      verb: 'dependency.added',
      entityType: 'dependency',
      entityId: dep.id,
      meta: { type: dto.type },
    });
    return view;
  }

  @Delete('dependencies/:dependencyId')
  @RequirePermissions('dependency.manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove a dependency' })
  async remove(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('dependencyId', ParseObjectIdPipe) dependencyId: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ message: string }> {
    await this.deps.remove(workspaceId, dependencyId);
    this.realtime.emitToWorkspace(workspaceId, 'dependency.updated', { dependencyId, action: 'removed' }, userId);
    return { message: 'Dependency removed.' };
  }

  @Post('tasks/:taskId/schedule-impact')
  @RequirePermissions('task.read')
  @ApiOperation({ summary: 'Preview downstream tasks affected if this task finishes on a new date' })
  scheduleImpact(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('taskId', ParseObjectIdPipe) taskId: string,
    @Body() dto: ScheduleImpactDto,
  ): Promise<ScheduleImpactRow[]> {
    return this.deps.scheduleImpact(workspaceId, taskId, new Date(dto.newFinish));
  }

  @Post('tasks/apply-schedule-shift')
  @RequirePermissions('dependency.manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Apply a reviewed set of downstream date shifts' })
  async applyShift(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ApplyShiftDto,
  ): Promise<{ updated: number }> {
    const updated = await this.deps.applyScheduleShift(workspaceId, dto.shifts);
    return { updated };
  }
}
