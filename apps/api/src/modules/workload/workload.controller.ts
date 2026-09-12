import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsDateString, IsIn, IsInt, IsMongoId, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Membership, RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import type { WorkspaceMembershipContext } from '../../common/context/request-context.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ApiException } from '../../common/http/api-exception.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { WorkloadService, type AvailabilityView, type WorkloadRow } from './workload.service.js';

class UpdateAvailabilityDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(168) weeklyHours?: number;
  @IsOptional() @IsArray() @ArrayNotEmpty() @IsInt({ each: true }) workingDays?: number[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(24) hoursPerDay?: number;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
}
class CreateExceptionDto {
  @IsOptional() @IsMongoId() userId?: string | null;
  @IsIn(['leave', 'holiday', 'partial']) type!: 'leave' | 'holiday' | 'partial';
  @IsDateString() from!: string;
  @IsDateString() to!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(24) hoursPerDay?: number;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

@ApiTags('workload')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId')
export class WorkloadController {
  constructor(private readonly workload: WorkloadService) {}

  // ── availability ─────────────────────────────────────────────────────
  @Get('availability/me')
  @RequirePermissions('workspace.read')
  @ApiOperation({ summary: 'My working schedule' })
  mine(@Param('workspaceId', ParseObjectIdPipe) w: string, @CurrentUser('id') u: string): Promise<AvailabilityView> {
    return this.workload.getForUser(w, u);
  }

  @Patch('availability/me')
  @RequirePermissions('workspace.read')
  @ApiOperation({ summary: 'Update my working schedule' })
  updateMine(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') u: string,
    @Body() dto: UpdateAvailabilityDto,
  ): Promise<AvailabilityView> {
    return this.workload.updateForUser(w, u, dto);
  }

  @Get('availability')
  @RequirePermissions('workload.read')
  @ApiOperation({ summary: 'Everyone’s working schedule' })
  all(@Param('workspaceId', ParseObjectIdPipe) w: string): Promise<AvailabilityView[]> {
    return this.workload.listForWorkspace(w);
  }

  @Patch('availability/:userId')
  @RequirePermissions('availability.manage')
  @ApiOperation({ summary: 'Update another member’s schedule' })
  updateOther(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('userId', ParseObjectIdPipe) userId: string,
    @Body() dto: UpdateAvailabilityDto,
  ): Promise<AvailabilityView> {
    return this.workload.updateForUser(w, userId, dto);
  }

  // ── exceptions (leave / holidays) ────────────────────────────────────
  @Get('availability-exceptions')
  @RequirePermissions('workspace.read')
  @ApiOperation({ summary: 'Leave and holidays in a window' })
  async listExceptions(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<unknown[]> {
    const rows = await this.workload.listExceptions(w, {
      userId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
    return rows.map((r) => this.workload.exceptionView(r));
  }

  @Post('availability-exceptions')
  @RequirePermissions('availability.manage')
  @ApiOperation({ summary: 'Record leave (per user) or a workspace holiday' })
  async createException(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') u: string,
    @Membership() ctx: WorkspaceMembershipContext,
    @Body() dto: CreateExceptionDto,
  ): Promise<unknown> {
    // members can only add their own leave unless they can manage availability
    const userId = dto.type === 'holiday' ? null : (dto.userId ?? u);
    if (userId && userId !== u && !ctx.permissions.has('availability.manage') && !ctx.isOwner) {
      throw ApiException.forbidden('You can only record your own leave.');
    }
    const doc = await this.workload.createException(w, { ...dto, userId });
    return this.workload.exceptionView(doc);
  }

  @Delete('availability-exceptions/:exceptionId')
  @RequirePermissions('availability.manage')
  @HttpCode(200)
  async removeException(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('exceptionId', ParseObjectIdPipe) exceptionId: string,
  ): Promise<{ message: string }> {
    await this.workload.removeException(w, exceptionId);
    return { message: 'Removed.' };
  }

  // ── workload / resource planner ──────────────────────────────────────
  @Get('workload')
  @RequirePermissions('workload.read')
  @ApiOperation({ summary: 'Per-user available vs planned hours + capacity band' })
  compute(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('projectId') projectId?: string,
  ): Promise<WorkloadRow[]> {
    const fromD = from ? new Date(from) : new Date();
    const toD = to ? new Date(to) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(fromD.getTime()) || Number.isNaN(toD.getTime())) throw ApiException.validation('Invalid date range.');
    return this.workload.workload(w, fromD, toD, projectId);
  }
}
