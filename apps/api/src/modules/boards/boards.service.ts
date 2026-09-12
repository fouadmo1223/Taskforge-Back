import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { initialRanks, rankAfter, rankBetween } from '@flowdesk/utils';
import { ApiException } from '../../common/http/api-exception.js';
import { BoardColumn, type BoardColumnDocument } from '../columns/schemas/board-column.schema.js';
import { Task, type TaskDocument } from '../tasks/schemas/task.schema.js';
import { Board, type BoardDocument } from './schemas/board.schema.js';

const STARTER_COLUMNS: Array<{ name: string; statusCategory: BoardColumnDocument['statusCategory'] }> = [
  { name: 'To Do', statusCategory: 'todo' },
  { name: 'In Progress', statusCategory: 'in_progress' },
  { name: 'Done', statusCategory: 'done' },
];

export interface BoardView {
  id: string;
  projectId: string;
  name: string;
  isDefault: boolean;
  rank: string;
  archived: boolean;
}

@Injectable()
export class BoardsService {
  constructor(
    @InjectModel(Board.name) private readonly boards: Model<BoardDocument>,
    @InjectModel(BoardColumn.name) private readonly columns: Model<BoardColumnDocument>,
    @InjectModel(Task.name) private readonly tasks: Model<TaskDocument>,
  ) {}

  async workspaceIdOf(boardId: string): Promise<string | null> {
    if (!Types.ObjectId.isValid(boardId)) return null;
    const b = await this.boards.findById(boardId).select('workspaceId').lean();
    return b?.workspaceId.toString() ?? null;
  }

  listForProject(projectId: string): Promise<BoardDocument[]> {
    return this.boards.find({ projectId: new Types.ObjectId(projectId) }).sort({ rank: 1 }).exec();
  }

  async getOrThrow(workspaceId: string, boardId: string): Promise<BoardDocument> {
    const board = await this.boards.findOne({ _id: boardId, workspaceId: new Types.ObjectId(workspaceId) }).exec();
    if (!board) throw ApiException.notFound('Board');
    return board;
  }

  async create(workspaceId: string, projectId: string, name: string): Promise<BoardDocument> {
    const last = await this.boards.findOne({ projectId: new Types.ObjectId(projectId) }).sort({ rank: -1 }).select('rank').lean();
    const board = await this.boards.create({
      workspaceId: new Types.ObjectId(workspaceId),
      projectId: new Types.ObjectId(projectId),
      name: name.trim(),
      isDefault: false,
      rank: rankAfter(last?.rank ?? null),
    });
    const ranks = initialRanks(STARTER_COLUMNS.length);
    await this.columns.create(
      STARTER_COLUMNS.map((c, i) => ({
        workspaceId: board.workspaceId,
        boardId: board._id,
        projectId: board.projectId,
        name: c.name,
        statusCategory: c.statusCategory,
        rank: ranks[i]!,
      })),
    );
    return board;
  }

  async rename(workspaceId: string, boardId: string, name: string): Promise<BoardDocument> {
    const board = await this.getOrThrow(workspaceId, boardId);
    board.name = name.trim();
    await board.save();
    return board;
  }

  async setArchived(workspaceId: string, boardId: string, archived: boolean): Promise<BoardDocument> {
    const board = await this.getOrThrow(workspaceId, boardId);
    if (archived && board.isDefault) throw ApiException.validation('The default board cannot be archived.');
    board.archivedAt = archived ? new Date() : null;
    await board.save();
    return board;
  }

  async reorder(workspaceId: string, boardId: string, beforeId: string | null, afterId: string | null): Promise<BoardDocument> {
    const board = await this.getOrThrow(workspaceId, boardId);
    const [before, after] = await Promise.all([
      beforeId ? this.boards.findById(beforeId).select('rank projectId').lean() : null,
      afterId ? this.boards.findById(afterId).select('rank projectId').lean() : null,
    ]);
    board.rank = rankBetween(before?.rank ?? null, after?.rank ?? null);
    await board.save();
    return board;
  }

  async remove(workspaceId: string, boardId: string, userId: string): Promise<void> {
    const board = await this.getOrThrow(workspaceId, boardId);
    if (board.isDefault) throw ApiException.validation('The default board cannot be deleted.');
    const remaining = await this.boards.countDocuments({ projectId: board.projectId });
    if (remaining <= 1) throw ApiException.validation('A project must keep at least one board.');
    await this.tasks.updateMany(
      { boardId: board._id, deletedAt: null },
      { $set: { deletedAt: new Date(), deletedBy: new Types.ObjectId(userId) } },
    );
    await this.columns.deleteMany({ boardId: board._id });
    await this.boards.deleteOne({ _id: board._id });
  }

  toView(board: BoardDocument): BoardView {
    return {
      id: board.id,
      projectId: board.projectId.toString(),
      name: board.name,
      isDefault: board.isDefault,
      rank: board.rank,
      archived: board.archivedAt !== null,
    };
  }
}
