import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Membership, RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import type { WorkspaceMembershipContext } from '../../common/context/request-context.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { BoardsService, type BoardView } from '../boards/boards.service.js';
import { ColumnsService, type ColumnView } from '../columns/columns.service.js';
import { TasksService } from './tasks.service.js';
import { toTaskView, type TaskView } from './task.view.js';

interface BoardBundle {
  board: BoardView;
  columns: ColumnView[];
  tasks: TaskView[];
}

@ApiTags('boards')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId/boards')
export class BoardViewController {
  constructor(
    private readonly boards: BoardsService,
    private readonly columns: ColumnsService,
    private readonly tasks: TasksService,
  ) {}

  @Get(':boardId/view')
  @RequirePermissions('board.read')
  @ApiOperation({ summary: 'Board render bundle: board + columns + top-level tasks in one call' })
  async view(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('boardId', ParseObjectIdPipe) boardId: string,
    @Membership() ctx: WorkspaceMembershipContext,
  ): Promise<BoardBundle> {
    const board = await this.boards.getOrThrow(workspaceId, boardId);
    const [columns, tasks] = await Promise.all([
      this.columns.listForBoard(boardId),
      this.tasks.listForBoard(workspaceId, boardId, { clientVisibleOnly: ctx.isClient }),
    ]);
    return {
      board: this.boards.toView(board),
      columns: columns.map((c) => this.columns.toView(c)),
      tasks: tasks.map(toTaskView),
    };
  }
}
