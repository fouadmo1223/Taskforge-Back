import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GOAL_STATUSES, GOAL_TYPES, type GoalStatus, type GoalType } from '@flowdesk/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { GoalsService, type GoalView } from './goals.service.js';

class CreateGoalDto {
  @IsString() @MinLength(1) @MaxLength(240) title!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsIn(GOAL_TYPES as unknown as string[]) type?: GoalType;
  @IsOptional() @IsNumber() start?: number;
  @IsOptional() @IsNumber() target?: number;
  @IsOptional() @IsNumber() current?: number;
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @IsOptional() @IsMongoId() ownerUserId?: string;
  @IsOptional() @IsMongoId() portfolioId?: string;
  @IsOptional() @IsMongoId() projectId?: string;
  @IsOptional() @IsMongoId() parentGoalId?: string;
  @IsOptional() @IsString() dueDate?: string;
}

class UpdateGoalDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(240) title?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsNumber() target?: number;
  @IsOptional() @IsNumber() current?: number;
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @IsOptional() @IsIn(GOAL_STATUSES as unknown as string[]) status?: GoalStatus;
  @IsOptional() @IsMongoId() ownerUserId?: string | null;
  @IsOptional() @IsString() dueDate?: string;
}

class KeyResultDto {
  @IsString() @MinLength(1) @MaxLength(240) title!: string;
  @IsOptional() @IsNumber() start?: number;
  @IsOptional() @IsNumber() target?: number;
  @IsOptional() @IsNumber() current?: number;
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
}
class SetKeyResultsDto {
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => KeyResultDto) keyResults!: KeyResultDto[];
}

@ApiTags('goals')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId/goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get()
  @RequirePermissions('project.read')
  @ApiOperation({ summary: 'List goals' })
  async list(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Query('portfolioId') portfolioId?: string,
    @Query('projectId') projectId?: string,
    @Query('status') status?: GoalStatus,
  ): Promise<GoalView[]> {
    return (await this.goals.list(w, { portfolioId, projectId, status })).map((g) => this.goals.toView(g));
  }

  @Post()
  @RequirePermissions('goal.manage')
  @ApiOperation({ summary: 'Create a goal' })
  async create(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateGoalDto,
  ): Promise<GoalView> {
    return this.goals.toView(await this.goals.create(w, userId, dto));
  }

  @Patch(':goalId')
  @RequirePermissions('goal.manage')
  @ApiOperation({ summary: 'Update a goal / record progress' })
  async update(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('goalId', ParseObjectIdPipe) goalId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateGoalDto,
  ): Promise<GoalView> {
    return this.goals.toView(await this.goals.update(w, goalId, userId, dto));
  }

  @Put(':goalId/key-results')
  @RequirePermissions('goal.manage')
  @ApiOperation({ summary: 'Replace a goal’s key results' })
  async setKeyResults(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('goalId', ParseObjectIdPipe) goalId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SetKeyResultsDto,
  ): Promise<GoalView> {
    return this.goals.toView(await this.goals.setKeyResults(w, goalId, userId, dto.keyResults));
  }

  @Delete(':goalId')
  @RequirePermissions('goal.manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a goal' })
  async remove(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('goalId', ParseObjectIdPipe) goalId: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ message: string }> {
    await this.goals.remove(w, goalId, userId);
    return { message: 'Goal deleted.' };
  }
}
