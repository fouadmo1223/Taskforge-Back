import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CursorPage } from '@flowdesk/types';
import { CursorPageQueryDto } from '../../common/dto/pagination.dto.js';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { ActivityService, type ActivityView } from './activity.service.js';

@ApiTags('activity')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get('activity')
  @RequirePermissions('workspace.read')
  @ApiOperation({ summary: 'Workspace-wide activity feed' })
  workspaceFeed(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Query() q: CursorPageQueryDto,
  ): Promise<CursorPage<ActivityView>> {
    return this.activity.feed({ workspaceId }, q);
  }

  @Get('projects/:projectId/activity')
  @RequirePermissions('project.read')
  @ApiOperation({ summary: 'Activity feed for one project' })
  projectFeed(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('projectId', ParseObjectIdPipe) projectId: string,
    @Query() q: CursorPageQueryDto,
  ): Promise<CursorPage<ActivityView>> {
    return this.activity.feed({ workspaceId, projectId }, q);
  }

  @Get('tasks/:taskId/activity')
  @RequirePermissions('task.read')
  @ApiOperation({ summary: 'Activity feed for one task' })
  taskFeed(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('taskId', ParseObjectIdPipe) taskId: string,
    @Query() q: CursorPageQueryDto,
  ): Promise<CursorPage<ActivityView>> {
    return this.activity.feed({ workspaceId, taskId }, q);
  }
}
