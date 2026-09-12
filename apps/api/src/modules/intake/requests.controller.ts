import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TASK_PRIORITIES, type TaskPriority } from '@flowdesk/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { RequestsService, type RequestView } from './requests.service.js';
import { REQUEST_STATUSES, type RequestStatus } from './schemas/request.schema.js';

class CreateRequestDto {
  @IsString() @MinLength(1) @MaxLength(240) title!: string;
  @IsOptional() @IsString() @MaxLength(8000) description?: string;
  @IsOptional() @IsIn(TASK_PRIORITIES as unknown as string[]) priority?: TaskPriority;
  @IsOptional() @IsMongoId() projectId?: string;
  @IsOptional() @IsMongoId() clientId?: string;
  @IsOptional() @IsMongoId() assigneeUserId?: string;
}

class UpdateRequestDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(240) title?: string;
  @IsOptional() @IsString() @MaxLength(8000) description?: string;
  @IsOptional() @IsIn(REQUEST_STATUSES as unknown as string[]) status?: RequestStatus;
  @IsOptional() @IsIn(TASK_PRIORITIES as unknown as string[]) priority?: TaskPriority;
  @IsOptional() @IsMongoId() projectId?: string;
  @IsOptional() @IsMongoId() assigneeUserId?: string;
}

class ConvertRequestDto {
  @IsMongoId() projectId!: string;
  @IsOptional() @IsMongoId() columnId?: string;
}

@ApiTags('requests')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId/requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  @RequirePermissions('request.read')
  @ApiOperation({ summary: 'List intake requests' })
  async list(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Query('status') status?: RequestStatus,
    @Query('clientId') clientId?: string,
  ): Promise<RequestView[]> {
    const rows = await this.requests.list(w, { status, clientId });
    return rows.map((r) => this.requests.toView(r));
  }

  @Get(':requestId')
  @RequirePermissions('request.read')
  @ApiOperation({ summary: 'Get one request' })
  async getOne(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('requestId', ParseObjectIdPipe) requestId: string,
  ): Promise<RequestView> {
    return this.requests.toView(await this.requests.getOrThrow(w, requestId));
  }

  @Post()
  @RequirePermissions('request.manage')
  @ApiOperation({ summary: 'Create a request manually' })
  async create(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Body() dto: CreateRequestDto,
  ): Promise<RequestView> {
    return this.requests.toView(await this.requests.create(w, { ...dto, source: 'manual' }));
  }

  @Patch(':requestId')
  @RequirePermissions('request.manage')
  @ApiOperation({ summary: 'Update a request (triage, assign, re-prioritise)' })
  async update(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('requestId', ParseObjectIdPipe) requestId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateRequestDto,
  ): Promise<RequestView> {
    return this.requests.toView(await this.requests.update(w, requestId, dto, userId));
  }

  @Post(':requestId/convert')
  @RequirePermissions('request.manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Convert an accepted request into a task' })
  async convert(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('requestId', ParseObjectIdPipe) requestId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ConvertRequestDto,
  ): Promise<{ request: RequestView; taskId: string; taskKey: string }> {
    const result = await this.requests.convertToTask(w, requestId, userId, dto);
    return { request: this.requests.toView(result.request), taskId: result.taskId, taskKey: result.taskKey };
  }
}
