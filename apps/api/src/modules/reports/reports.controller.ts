import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { ReportsService, type ProjectStatusRow, type ThroughputBucket } from './reports.service.js';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@RequirePermissions('report.read')
@Controller('workspaces/:workspaceId/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('project-status')
  @ApiOperation({ summary: 'Task status breakdown + overdue + completion per project' })
  projectStatus(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Query('projectIds') projectIds?: string,
  ): Promise<ProjectStatusRow[]> {
    return this.reports.projectStatus(w, projectIds ? projectIds.split(',').filter(Boolean) : undefined);
  }

  @Get('throughput')
  @ApiOperation({ summary: 'Tasks created vs completed, per week' })
  throughput(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Query('projectId') projectId?: string,
    @Query('weeks') weeks?: string,
  ): Promise<ThroughputBucket[]> {
    const n = Math.max(1, Math.min(26, Number(weeks) || 8));
    return this.reports.throughput(w, projectId, n);
  }

  @Get('priority-breakdown')
  @ApiOperation({ summary: 'Open task count by priority' })
  priorityBreakdown(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Query('projectId') projectId?: string,
  ): Promise<Record<string, number>> {
    return this.reports.priorityBreakdown(w, projectId);
  }
}
