import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { BoardsService, type BoardView } from './boards.service.js';

class CreateBoardDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
}
class RenameBoardDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
}
class ArchiveBoardDto {
  @IsBoolean() archived!: boolean;
}
class ReorderBoardDto {
  @IsOptional() @IsMongoId() beforeBoardId?: string | null;
  @IsOptional() @IsMongoId() afterBoardId?: string | null;
}

@ApiTags('boards')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId')
export class BoardsController {
  constructor(
    private readonly boards: BoardsService,
    private readonly realtime: RealtimeService,
  ) {}

  @Get('projects/:projectId/boards')
  @RequirePermissions('board.read')
  @ApiOperation({ summary: 'List boards for a project' })
  async list(@Param('projectId', ParseObjectIdPipe) projectId: string): Promise<BoardView[]> {
    return (await this.boards.listForProject(projectId)).map((b) => this.boards.toView(b));
  }

  @Post('projects/:projectId/boards')
  @RequirePermissions('board.manage')
  @ApiOperation({ summary: 'Create an extra board for a project' })
  async create(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('projectId', ParseObjectIdPipe) projectId: string,
    @Body() dto: CreateBoardDto,
  ): Promise<BoardView> {
    return this.boards.toView(await this.boards.create(workspaceId, projectId, dto.name));
  }

  @Patch('boards/:boardId')
  @RequirePermissions('board.manage')
  @ApiOperation({ summary: 'Rename a board' })
  async rename(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('boardId', ParseObjectIdPipe) boardId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: RenameBoardDto,
  ): Promise<BoardView> {
    const board = await this.boards.rename(workspaceId, boardId, dto.name);
    const view = this.boards.toView(board);
    this.realtime.emitToWorkspace(workspaceId, 'board.updated', { board: view }, userId);
    return view;
  }

  @Post('boards/:boardId/archive')
  @RequirePermissions('board.manage')
  @ApiOperation({ summary: 'Archive or unarchive a board' })
  async archive(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('boardId', ParseObjectIdPipe) boardId: string,
    @Body() dto: ArchiveBoardDto,
  ): Promise<BoardView> {
    return this.boards.toView(await this.boards.setArchived(workspaceId, boardId, dto.archived));
  }

  @Patch('boards/:boardId/reorder')
  @RequirePermissions('board.manage')
  @ApiOperation({ summary: 'Reorder a board within its project' })
  async reorder(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('boardId', ParseObjectIdPipe) boardId: string,
    @Body() dto: ReorderBoardDto,
  ): Promise<BoardView> {
    return this.boards.toView(
      await this.boards.reorder(workspaceId, boardId, dto.beforeBoardId ?? null, dto.afterBoardId ?? null),
    );
  }

  @Delete('boards/:boardId')
  @RequirePermissions('board.manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a non-default board (its tasks are trashed)' })
  async remove(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('boardId', ParseObjectIdPipe) boardId: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ message: string }> {
    await this.boards.remove(workspaceId, boardId, userId);
    return { message: 'Board deleted.' };
  }
}
