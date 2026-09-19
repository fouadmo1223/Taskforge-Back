import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard.js';
import { AdminStatsService, type AdminDashboardStats } from './admin-stats.service.js';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(PlatformAdminGuard)
@Controller('admin/stats')
export class AdminStatsController {
  constructor(private readonly stats: AdminStatsService) {}

  @Get()
  @ApiOperation({ summary: '[Platform admin] Dashboard overview counters' })
  dashboard(): Promise<AdminDashboardStats> {
    return this.stats.dashboard();
  }
}
