import { Body, Controller, Get, HttpCode, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { OffsetPage } from '@flowdesk/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { AuditService } from '../audit/audit.service.js';
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
    private readonly audit: AuditService,
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
  async verify(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser('id') adminId: string): Promise<AdminUserDetail> {
    await this.users.adminVerifyEmail(id);
    this.audit.record({ workspaceId: null, actorUserId: adminId, action: 'user.verified_by_admin', entityType: 'user', entityId: id });
    return this.adminUsers.getById(id);
  }

  @Patch(':id/ban')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ban a user — invalidates all of their existing sessions immediately' })
  async ban(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: BanUserDto, @CurrentUser('id') adminId: string): Promise<AdminUserDetail> {
    await this.users.setSuspended(id, true, dto.reason ?? null);
    this.audit.record({
      workspaceId: null,
      actorUserId: adminId,
      action: 'user.banned',
      entityType: 'user',
      entityId: id,
      after: { reason: dto.reason ?? null },
    });
    return this.adminUsers.getById(id);
  }

  @Patch(':id/unban')
  @HttpCode(200)
  @ApiOperation({ summary: 'Lift a ban on a user' })
  async unban(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser('id') adminId: string): Promise<AdminUserDetail> {
    await this.users.setSuspended(id, false);
    this.audit.record({ workspaceId: null, actorUserId: adminId, action: 'user.unbanned', entityType: 'user', entityId: id });
    return this.adminUsers.getById(id);
  }
}
