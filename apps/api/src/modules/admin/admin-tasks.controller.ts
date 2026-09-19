import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { OffsetPage } from '@flowdesk/types';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { AdminListTasksQueryDto } from './dto/admin.dto.js';
import { AdminTasksService, type AdminTaskDetail, type AdminTaskListItem } from './admin-tasks.service.js';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(PlatformAdminGuard)
@Controller('admin/tasks')
export class AdminTasksController {
  constructor(private readonly adminTasks: AdminTasksService) {}

  @Get()
  @ApiOperation({ summary: '[Platform admin] List every task across every project' })
  list(@Query() query: AdminListTasksQueryDto): Promise<OffsetPage<AdminTaskListItem>> {
    return this.adminTasks.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '[Platform admin] One task with project + people resolved' })
  getById(@Param('id', ParseObjectIdPipe) id: string): Promise<AdminTaskDetail> {
    return this.adminTasks.getById(id);
  }
}
