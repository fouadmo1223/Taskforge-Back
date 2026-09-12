import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { TimesheetsService, type TimesheetWeekView } from './timesheets.service.js';

class SubmitDto {
  @IsString() periodStart!: string;
}
class ReviewDto {
  @IsIn(['approve', 'reject']) decision!: 'approve' | 'reject';
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

@ApiTags('timesheets')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId/timesheets')
export class TimesheetsController {
  constructor(
    private readonly timesheets: TimesheetsService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get('week')
  @RequirePermissions('time.read')
  @ApiOperation({ summary: 'My timesheet for a given week (?periodStart=ISO date)' })
  week(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') u: string,
    @Query('periodStart') periodStart?: string,
  ): Promise<TimesheetWeekView> {
    return this.timesheets.week(w, u, periodStart ?? new Date().toISOString());
  }

  @Get('mine')
  @RequirePermissions('time.read')
  @ApiOperation({ summary: 'My timesheet history' })
  mine(@Param('workspaceId', ParseObjectIdPipe) w: string, @CurrentUser('id') u: string): ReturnType<TimesheetsService['mine']> {
    return this.timesheets.mine(w, u);
  }

  @Post('submit')
  @RequirePermissions('timesheet.submit')
  @ApiOperation({ summary: 'Submit my timesheet for review' })
  async submit(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') u: string,
    @Body() dto: SubmitDto,
  ): Promise<{ status: string; totalSeconds: number }> {
    return this.timesheets.submit(w, u, dto.periodStart);
  }

  @Get('pending')
  @RequirePermissions('timesheet.approve')
  @ApiOperation({ summary: 'Timesheets awaiting approval' })
  pending(@Param('workspaceId', ParseObjectIdPipe) w: string): ReturnType<TimesheetsService['listPending']> {
    return this.timesheets.listPending(w);
  }

  @Post(':timesheetId/review')
  @RequirePermissions('timesheet.approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve or reject a submitted timesheet' })
  async review(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('timesheetId', ParseObjectIdPipe) timesheetId: string,
    @CurrentUser('id') u: string,
    @Body() dto: ReviewDto,
  ): Promise<{ status: string }> {
    const res = await this.timesheets.review(w, u, timesheetId, dto.decision, dto.note);
    await this.notifications.notify([res.ownerUserId], {
      workspaceId: w,
      type: dto.decision === 'approve' ? 'timesheet.approved' : 'timesheet.rejected',
      title: dto.decision === 'approve' ? 'Your timesheet was approved' : 'Your timesheet needs changes',
      body: dto.note ?? `Week of ${res.periodStart.slice(0, 10)}`,
      actorUserId: u,
      entityType: 'timesheet',
      entityId: timesheetId,
    });
    return { status: res.status };
  }
}
