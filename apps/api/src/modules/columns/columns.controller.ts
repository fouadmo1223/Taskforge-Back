import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsMongoId, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
import { STATUS_CATEGORIES, type StatusCategory } from '@flowdesk/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { ColumnsService, type ColumnView } from './columns.service.js';

class CreateColumnDto {
  @IsString() @MinLength(1) @MaxLength(60) name!: string;
  @IsMongoId() projectId!: string;
  @IsOptional() @IsIn(STATUS_CATEGORIES as unknown as string[]) statusCategory?: StatusCategory;
  @IsOptional() @IsInt() @Min(0) wipLimit?: number;
  @IsOptional() @IsString() @Matches(HEX, { message: 'color must be a hex value' }) color?: string;
}
class UpdateColumnDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) name?: string;
  @IsOptional() @IsIn(STATUS_CATEGORIES as unknown as string[]) statusCategory?: StatusCategory;
  @IsOptional() @IsInt() @Min(0) wipLimit?: number;
  /** empty string clears the accent */
  @IsOptional() @IsString() @Matches(new RegExp(`(${HEX.source})|^$`), { message: 'color must be a hex value' }) color?: string;
}
class ReorderColumnDto {
  @IsOptional() @IsMongoId() beforeColumnId?: string | null;
  @IsOptional() @IsMongoId() afterColumnId?: string | null;
}

@ApiTags('columns')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId')
export class ColumnsController {
  constructor(
    private readonly columns: ColumnsService,
    private readonly realtime: RealtimeService,
  ) {}

  @Get('boards/:boardId/columns')
  @RequirePermissions('board.read')
  @ApiOperation({ summary: 'List columns for a board' })
  async list(@Param('boardId', ParseObjectIdPipe) boardId: string): Promise<ColumnView[]> {
    return (await this.columns.listForBoard(boardId)).map((c) => this.columns.toView(c));
  }

  @Post('boards/:boardId/columns')
  @RequirePermissions('board.manage')
  @ApiOperation({ summary: 'Add a column to a board' })
  async create(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('boardId', ParseObjectIdPipe) boardId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateColumnDto,
  ): Promise<ColumnView> {
    const col = await this.columns.create(workspaceId, boardId, dto.projectId, dto);
    const view = this.columns.toView(col);
    this.realtime.emitToWorkspace(workspaceId, 'column.created', { column: view }, userId);
    return view;
  }

  @Patch('columns/:columnId')
  @RequirePermissions('board.manage')
  @ApiOperation({ summary: 'Update a column' })
  async update(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('columnId', ParseObjectIdPipe) columnId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateColumnDto,
  ): Promise<ColumnView> {
    const col = await this.columns.update(workspaceId, columnId, dto);
    const view = this.columns.toView(col);
    this.realtime.emitToWorkspace(workspaceId, 'column.updated', { column: view }, userId);
    return view;
  }

  @Patch('columns/:columnId/reorder')
  @RequirePermissions('board.manage')
  @ApiOperation({ summary: 'Move a column between two siblings' })
  async reorder(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('columnId', ParseObjectIdPipe) columnId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ReorderColumnDto,
  ): Promise<ColumnView> {
    const col = await this.columns.reorder(workspaceId, columnId, dto.beforeColumnId ?? null, dto.afterColumnId ?? null);
    const view = this.columns.toView(col);
    this.realtime.emitToWorkspace(workspaceId, 'column.reordered', { columnId, rank: view.rank }, userId);
    return view;
  }

  @Delete('columns/:columnId')
  @RequirePermissions('board.manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a column (relocate its tasks with moveToColumnId)' })
  async remove(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('columnId', ParseObjectIdPipe) columnId: string,
    @CurrentUser('id') userId: string,
    @Query('moveToColumnId') moveToColumnId?: string,
  ): Promise<{ message: string }> {
    const col = await this.columns.remove(workspaceId, columnId, moveToColumnId ?? null);
    this.realtime.emitToWorkspace(workspaceId, 'column.deleted', { columnId }, userId);
    return { message: 'Column deleted.' };
  }
}
