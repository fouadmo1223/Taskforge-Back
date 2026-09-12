import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ApiException } from '../../common/http/api-exception.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { PlanningService, type TimelineResponse } from './planning.service.js';

class CreateBaselineDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
}

@ApiTags('planning')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId/projects/:projectId')
export class PlanningController {
  constructor(private readonly planning: PlanningService) {}

  @Get('timeline')
  @RequirePermissions('task.read')
  @ApiOperation({ summary: 'Gantt bundle: tasks + dependencies + milestones + baseline + critical path' })
  timeline(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('projectId', ParseObjectIdPipe) projectId: string,
  ): Promise<TimelineResponse> {
    return this.planning.timeline(workspaceId, projectId);
  }

  @Get('calendar')
  @RequirePermissions('task.read')
  @ApiOperation({ summary: 'Tasks with due dates + milestones in a date window' })
  calendar(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('projectId', ParseObjectIdPipe) projectId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): ReturnType<PlanningService['calendar']> {
    const fromD = from ? new Date(from) : new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const toD = to ? new Date(to) : new Date(Date.now() + 62 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(fromD.getTime()) || Number.isNaN(toD.getTime())) {
      throw ApiException.validation('Invalid date range.');
    }
    return this.planning.calendar(workspaceId, projectId, fromD, toD);
  }

  @Get('baselines')
  @RequirePermissions('task.read')
  @ApiOperation({ summary: 'List saved baselines' })
  listBaselines(@Param('projectId', ParseObjectIdPipe) projectId: string): ReturnType<PlanningService['listBaselines']> {
    return this.planning.listBaselines(projectId);
  }

  @Post('baselines')
  @RequirePermissions('milestone.manage')
  @ApiOperation({ summary: 'Snapshot current task dates as a baseline' })
  async createBaseline(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('projectId', ParseObjectIdPipe) projectId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateBaselineDto,
  ): Promise<{ id: string; name: string; createdAt: string }> {
    const b = await this.planning.createBaseline(workspaceId, projectId, userId, dto.name ?? '');
    return { id: b.id, name: b.name, createdAt: b.createdAt.toISOString() };
  }

  @Delete('baselines/:baselineId')
  @RequirePermissions('milestone.manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a baseline' })
  async deleteBaseline(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('baselineId', ParseObjectIdPipe) baselineId: string,
  ): Promise<{ message: string }> {
    await this.planning.deleteBaseline(workspaceId, baselineId);
    return { message: 'Baseline deleted.' };
  }
}
