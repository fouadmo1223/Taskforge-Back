import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TASK_PRIORITIES, type TaskPriority } from '@flowdesk/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { SlaService, type SlaPolicyView, type SlaTrackerView } from './sla.service.js';

class AppliesToDto {
  @IsOptional() @IsArray() @IsMongoId({ each: true }) projectIds?: string[];
  @IsOptional() @IsArray() @IsIn(TASK_PRIORITIES as unknown as string[], { each: true }) priorities?: TaskPriority[];
  @IsOptional() @IsArray() @IsString({ each: true }) types?: string[];
}

class CreatePolicyDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsNumber() @Min(0) responseHours!: number;
  @IsNumber() @Min(0) resolutionHours!: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) warnAtPercent?: number;
  @IsOptional() appliesTo?: AppliesToDto;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsMongoId({ each: true }) notifyUserIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsMongoId({ each: true }) escalateToUserIds?: string[];
}

class UpdatePolicyDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsNumber() @Min(0) responseHours?: number;
  @IsOptional() @IsNumber() @Min(0) resolutionHours?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) warnAtPercent?: number;
  @IsOptional() appliesTo?: AppliesToDto;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsMongoId({ each: true }) notifyUserIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsMongoId({ each: true }) escalateToUserIds?: string[];
}

@ApiTags('sla')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId/sla')
export class SlaController {
  constructor(private readonly sla: SlaService) {}

  @Get('policies')
  @RequirePermissions('project.read')
  @ApiOperation({ summary: 'List SLA policies' })
  async listPolicies(@Param('workspaceId', ParseObjectIdPipe) w: string): Promise<SlaPolicyView[]> {
    return (await this.sla.listPolicies(w)).map((p) => this.sla.policyView(p));
  }

  @Post('policies')
  @RequirePermissions('sla.manage')
  @ApiOperation({ summary: 'Create an SLA policy' })
  async createPolicy(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePolicyDto,
  ): Promise<SlaPolicyView> {
    return this.sla.policyView(await this.sla.createPolicy(w, userId, dto));
  }

  @Patch('policies/:policyId')
  @RequirePermissions('sla.manage')
  @ApiOperation({ summary: 'Update an SLA policy' })
  async updatePolicy(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('policyId', ParseObjectIdPipe) policyId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdatePolicyDto,
  ): Promise<SlaPolicyView> {
    return this.sla.policyView(await this.sla.updatePolicy(w, policyId, userId, dto));
  }

  @Delete('policies/:policyId')
  @RequirePermissions('sla.manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete an SLA policy and its trackers' })
  async deletePolicy(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('policyId', ParseObjectIdPipe) policyId: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ message: string }> {
    await this.sla.deletePolicy(w, policyId, userId);
    return { message: 'SLA policy deleted.' };
  }

  @Get('trackers')
  @RequirePermissions('project.read')
  @ApiOperation({ summary: 'List SLA trackers (task timers)' })
  trackers(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Query('projectId') projectId?: string,
  ): Promise<SlaTrackerView[]> {
    return this.sla.listTrackers(w, projectId);
  }

  @Post('sweep')
  @RequirePermissions('project.read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Recompute SLA states and fire escalations' })
  sweep(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ evaluated: number; warned: number; breached: number; created: number }> {
    return this.sla.sweep(w, userId);
  }
}
