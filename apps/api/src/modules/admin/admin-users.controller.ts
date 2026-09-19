import { Body, Controller, Get, HttpCode, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { OffsetPage } from '@flowdesk/types';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { UsersService } from '../users/users.service.js';
import { AdminListUsersQueryDto, BanUserDto } from './dto/admin.dto.js';
import { AdminUsersService, type AdminUserDetail, type AdminUserListItem } from './admin-users.service.js';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(PlatformAdminGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly adminUsers: AdminUsersService,
    private readonly users: UsersService,
  ) {}

  @Get()
  @ApiOperation({ summary: '[Platform admin] List every user on the platform' })
  list(@Query() query: AdminListUsersQueryDto): Promise<OffsetPage<AdminUserListItem>> {
    return this.adminUsers.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '[Platform admin] One user with cross-workspace stats' })
  getById(@Param('id', ParseObjectIdPipe) id: string): Promise<AdminUserDetail> {
    return this.adminUsers.getById(id);
  }

  @Patch(':id/verify')
  @HttpCode(200)
  @ApiOperation({ summary: "[Platform admin] Manually verify a user's email" })
  async verify(@Param('id', ParseObjectIdPipe) id: string): Promise<AdminUserDetail> {
    await this.users.adminVerifyEmail(id);
    return this.adminUsers.getById(id);
  }

  @Patch(':id/ban')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ban a user — invalidates all of their existing sessions immediately' })
  async ban(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: BanUserDto): Promise<AdminUserDetail> {
    await this.users.setSuspended(id, true, dto.reason ?? null);
    return this.adminUsers.getById(id);
  }

  @Patch(':id/unban')
  @HttpCode(200)
  @ApiOperation({ summary: 'Lift a ban on a user' })
  async unban(@Param('id', ParseObjectIdPipe) id: string): Promise<AdminUserDetail> {
    await this.users.setSuspended(id, false);
    return this.adminUsers.getById(id);
  }
}
