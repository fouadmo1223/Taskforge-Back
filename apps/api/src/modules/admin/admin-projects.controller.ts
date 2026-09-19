import { Body, Controller, Get, HttpCode, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import type { OffsetPage } from '@flowdesk/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { AuditService } from '../audit/audit.service.js';
import { AdminListProjectsQueryDto } from './dto/admin.dto.js';
import { AdminProjectsService, type AdminProjectDetail, type AdminProjectListItem } from './admin-projects.service.js';

class SetArchivedDto {
  @IsBoolean()
  archived!: boolean;
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(PlatformAdminGuard)
@Controller('admin/projects')
export class AdminProjectsController {
  constructor(
    private readonly adminProjects: AdminProjectsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: '[Platform admin] List every project across every workspace' })
  list(@Query() query: AdminListProjectsQueryDto): Promise<OffsetPage<AdminProjectListItem>> {
    return this.adminProjects.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '[Platform admin] One project with workspace + counts' })
  getById(@Param('id', ParseObjectIdPipe) id: string): Promise<AdminProjectDetail> {
    return this.adminProjects.getById(id);
  }

  @Patch(':id/archived')
  @HttpCode(200)
  @ApiOperation({ summary: '[Platform admin] Archive or restore a project' })
  async setArchived(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: SetArchivedDto,
    @CurrentUser('id') adminId: string,
  ): Promise<AdminProjectDetail> {
    const project = await this.adminProjects.archive(id, dto.archived);
    this.audit.record({
      workspaceId: project.workspaceId,
      actorUserId: adminId,
      actorLabel: 'Platform Admin',
      action: dto.archived ? 'project.archived_by_admin' : 'project.restored_by_admin',
      entityType: 'project',
      entityId: id,
    });
    return project;
  }
}
