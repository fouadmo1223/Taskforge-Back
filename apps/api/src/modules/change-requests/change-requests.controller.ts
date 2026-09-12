import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { APPROVAL_STRATEGIES, CHANGE_REQUEST_STATUSES, type ApprovalStrategy, type ChangeRequestStatus } from '@flowdesk/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { ChangeRequestsService, type ChangeRequestView } from './change-requests.service.js';

class CreateChangeRequestDto {
  @IsString() @MinLength(1) @MaxLength(240) title!: string;
  @IsOptional() @IsString() @MaxLength(12000) description?: string;
  @IsOptional() @IsString() @MaxLength(4000) reason?: string;
  @IsOptional() @IsString() @MaxLength(4000) scopeImpact?: string;
  @IsOptional() @IsNumber() scheduleImpactDays?: number;
  @IsOptional() @IsNumber() costImpact?: number;
}

class UpdateChangeRequestDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(240) title?: string;
  @IsOptional() @IsString() @MaxLength(12000) description?: string;
  @IsOptional() @IsString() @MaxLength(4000) reason?: string;
  @IsOptional() @IsString() @MaxLength(4000) scopeImpact?: string;
  @IsOptional() @IsNumber() scheduleImpactDays?: number;
  @IsOptional() @IsNumber() costImpact?: number;
}

class TransitionDto {
  @IsIn(CHANGE_REQUEST_STATUSES as unknown as string[]) to!: ChangeRequestStatus;
}

class RequestApprovalDto {
  @IsArray() @ArrayNotEmpty() @IsMongoId({ each: true }) approverUserIds!: string[];
  @IsIn(APPROVAL_STRATEGIES as unknown as string[]) strategy!: ApprovalStrategy;
  @IsOptional() @IsInt() @Min(1) requiredCount?: number;
}

@ApiTags('change-requests')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId')
export class ChangeRequestsController {
  constructor(private readonly crs: ChangeRequestsService) {}

  @Get('change-requests')
  @RequirePermissions('project.read')
  @ApiOperation({ summary: 'List change requests' })
  async list(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Query('projectId') projectId?: string,
    @Query('status') status?: ChangeRequestStatus,
  ): Promise<ChangeRequestView[]> {
    return (await this.crs.list(w, { projectId, status })).map((c) => this.crs.toView(c));
  }

  @Post('projects/:projectId/change-requests')
  @RequirePermissions('change.manage')
  @ApiOperation({ summary: 'Raise a change request' })
  async create(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('projectId', ParseObjectIdPipe) projectId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateChangeRequestDto,
  ): Promise<ChangeRequestView> {
    return this.crs.toView(await this.crs.create(w, projectId, userId, dto));
  }

  @Patch('change-requests/:id')
  @RequirePermissions('change.manage')
  @ApiOperation({ summary: 'Edit a change request' })
  async update(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateChangeRequestDto,
  ): Promise<ChangeRequestView> {
    return this.crs.toView(await this.crs.update(w, id, userId, dto));
  }

  @Post('change-requests/:id/transition')
  @RequirePermissions('change.manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Move a change request through its workflow' })
  async transition(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: TransitionDto,
  ): Promise<ChangeRequestView> {
    return this.crs.toView(await this.crs.transition(w, id, userId, dto.to));
  }

  @Post('change-requests/:id/request-approval')
  @RequirePermissions('change.manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a change request for approval' })
  async requestApproval(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: RequestApprovalDto,
  ): Promise<ChangeRequestView> {
    return this.crs.toView(await this.crs.requestApproval(w, id, userId, dto));
  }
}
