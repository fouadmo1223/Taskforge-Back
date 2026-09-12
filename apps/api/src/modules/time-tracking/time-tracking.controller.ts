import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsInt, IsMongoId, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Membership, RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import type { WorkspaceMembershipContext } from '../../common/context/request-context.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { TimeTrackingService, type TimeEntryView, type TimerView } from './time-tracking.service.js';

class StartTimerDto {
  @IsMongoId() taskId!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}
class ManualEntryDto {
  @IsMongoId() taskId!: string;
  @IsDateString() startedAt!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(1440) minutes!: number;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}
class UpdateEntryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1440) minutes?: number;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsDateString() startedAt?: string;
}

@ApiTags('time-tracking')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId')
export class TimeTrackingController {
  constructor(private readonly time: TimeTrackingService) {}

  // ── timer ─────────────────────────────────────────────────────────────
  @Get('timer')
  @RequirePermissions('time.log')
  @ApiOperation({ summary: 'Current running/paused timer for the user' })
  current(@Param('workspaceId', ParseObjectIdPipe) w: string, @CurrentUser('id') u: string): Promise<TimerView | null> {
    return this.time.current(w, u);
  }

  @Post('timer/start')
  @RequirePermissions('time.log')
  @ApiOperation({ summary: 'Start a timer on a task (auto-stops the previous one)' })
  start(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') u: string,
    @Body() dto: StartTimerDto,
  ): Promise<TimerView> {
    return this.time.start(w, u, dto.taskId, dto.description);
  }

  @Post('timer/pause')
  @RequirePermissions('time.log')
  pause(@Param('workspaceId', ParseObjectIdPipe) w: string, @CurrentUser('id') u: string): Promise<TimerView> {
    return this.time.pause(w, u);
  }

  @Post('timer/resume')
  @RequirePermissions('time.log')
  resume(@Param('workspaceId', ParseObjectIdPipe) w: string, @CurrentUser('id') u: string): Promise<TimerView> {
    return this.time.resume(w, u);
  }

  @Post('timer/stop')
  @RequirePermissions('time.log')
  @ApiOperation({ summary: 'Stop the timer and write a time entry' })
  stop(@Param('workspaceId', ParseObjectIdPipe) w: string, @CurrentUser('id') u: string): Promise<TimeEntryView> {
    return this.time.stop(w, u);
  }

  // ── entries ───────────────────────────────────────────────────────────
  @Get('time-entries')
  @RequirePermissions('time.read')
  @ApiOperation({ summary: 'List time entries (own; time.read + userId for others)' })
  list(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') u: string,
    @Membership() ctx: WorkspaceMembershipContext,
    @Query('userId') userId?: string,
    @Query('taskId') taskId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<TimeEntryView[]> {
    return this.time.listEntries(w, {
      userId,
      taskId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      mineUserId: u,
      canReadAll: ctx.isOwner || ctx.permissions.has('timesheet.approve'),
    });
  }

  @Post('time-entries')
  @RequirePermissions('time.log')
  @ApiOperation({ summary: 'Add a manual time entry' })
  addManual(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') u: string,
    @Body() dto: ManualEntryDto,
  ): Promise<TimeEntryView> {
    return this.time.addManual(w, u, dto);
  }

  @Patch('time-entries/:entryId')
  @RequirePermissions('time.log')
  update(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('entryId', ParseObjectIdPipe) entryId: string,
    @CurrentUser('id') u: string,
    @Body() dto: UpdateEntryDto,
  ): Promise<TimeEntryView> {
    return this.time.updateEntry(w, u, entryId, dto);
  }

  @Delete('time-entries/:entryId')
  @RequirePermissions('time.log')
  @HttpCode(200)
  async remove(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('entryId', ParseObjectIdPipe) entryId: string,
    @CurrentUser('id') u: string,
  ): Promise<{ message: string }> {
    await this.time.deleteEntry(w, u, entryId);
    return { message: 'Time entry deleted.' };
  }
}
