import { Body, Controller, Get, HttpCode, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import type { OffsetPage } from '@flowdesk/types';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
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
  constructor(private readonly adminProjects: AdminProjectsService) {}

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
  setArchived(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: SetArchivedDto): Promise<AdminProjectDetail> {
    return this.adminProjects.archive(id, dto.archived);
  }
}
