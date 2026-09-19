import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { OffsetPage } from '@flowdesk/types';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { AdminListWorkspacesQueryDto } from './dto/admin.dto.js';
import { AdminWorkspacesService, type AdminWorkspaceDetail, type AdminWorkspaceListItem } from './admin-workspaces.service.js';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(PlatformAdminGuard)
@Controller('admin/workspaces')
export class AdminWorkspacesController {
  constructor(private readonly adminWorkspaces: AdminWorkspacesService) {}

  @Get()
  @ApiOperation({ summary: '[Platform admin] List every workspace' })
  list(@Query() query: AdminListWorkspacesQueryDto): Promise<OffsetPage<AdminWorkspaceListItem>> {
    return this.adminWorkspaces.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '[Platform admin] One workspace with owner + counts' })
  getById(@Param('id', ParseObjectIdPipe) id: string): Promise<AdminWorkspaceDetail> {
    return this.adminWorkspaces.getById(id);
  }
}
