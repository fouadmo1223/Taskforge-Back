import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsMongoId,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TASK_PRIORITIES, type TaskPriority } from '@flowdesk/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { RecurringService, type CadenceInput, type RecurringTaskView } from './recurring.service.js';

class CreateRecurringDto {
  @IsMongoId() projectId!: string;
  @IsOptional() @IsMongoId() columnId?: string;
  @IsString() @MinLength(1) @MaxLength(300) title!: string;
  @IsOptional() @IsString() @MaxLength(8000) description?: string;
  @IsOptional() @IsIn(TASK_PRIORITIES as unknown as string[]) priority?: TaskPriority;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsMongoId({ each: true }) assigneeUserIds?: string[];
  @IsObject() cadence!: CadenceInput;
  @IsOptional() @IsString() startAt?: string;
}

class UpdateRecurringDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(300) title?: string;
  @IsOptional() @IsString() @MaxLength(8000) description?: string;
  @IsOptional() @IsIn(TASK_PRIORITIES as unknown as string[]) priority?: TaskPriority;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsMongoId({ each: true }) assigneeUserIds?: string[];
  @IsOptional() @IsMongoId() columnId?: string | null;
  @IsOptional() @IsObject() cadence?: CadenceInput;
  @IsOptional() @IsBoolean() active?: boolean;
}

@ApiTags('recurring')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId/recurring-tasks')
export class RecurringController {
  constructor(private readonly recurring: RecurringService) {}

  @Get()
  @RequirePermissions('task.read')
  @ApiOperation({ summary: 'List recurring task schedules' })
  async list(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Query('projectId') projectId?: string,
  ): Promise<RecurringTaskView[]> {
    return (await this.recurring.list(w, projectId)).map((r) => this.recurring.toView(r));
  }

  @Post()
  @RequirePermissions('task.create')
  @ApiOperation({ summary: 'Create a recurring task schedule' })
  async create(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateRecurringDto,
  ): Promise<RecurringTaskView> {
    return this.recurring.toView(await this.recurring.create(w, userId, dto));
  }

  @Patch(':id')
  @RequirePermissions('task.create')
  @ApiOperation({ summary: 'Update a schedule' })
  async update(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateRecurringDto,
  ): Promise<RecurringTaskView> {
    return this.recurring.toView(await this.recurring.update(w, id, dto));
  }

  @Delete(':id')
  @RequirePermissions('task.create')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a schedule' })
  async remove(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<{ message: string }> {
    await this.recurring.remove(w, id);
    return { message: 'Schedule deleted.' };
  }

  @Post('run-due')
  @RequirePermissions('task.create')
  @HttpCode(200)
  @ApiOperation({ summary: 'Materialise every schedule that is due' })
  runDue(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ created: number; schedules: number }> {
    return this.recurring.runDue(w, userId);
  }
}
