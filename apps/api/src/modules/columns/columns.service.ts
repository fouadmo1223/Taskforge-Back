import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { StatusCategory } from '@flowdesk/types';
import { rankAfter, rankBetween } from '@flowdesk/utils';
import { ApiException } from '../../common/http/api-exception.js';
import { Task, type TaskDocument } from '../tasks/schemas/task.schema.js';
import { BoardColumn, type BoardColumnDocument } from './schemas/board-column.schema.js';

export interface ColumnView {
  id: string;
  boardId: string;
  name: string;
  statusCategory: StatusCategory;
  color: string | null;
  rank: string;
  wipLimit: number;
}

@Injectable()
export class ColumnsService {
  constructor(
    @InjectModel(BoardColumn.name) private readonly model: Model<BoardColumnDocument>,
    @InjectModel(Task.name) private readonly tasks: Model<TaskDocument>,
  ) {}

  countTasks(columnId: string): Promise<number> {
    return this.tasks.countDocuments({ columnId: new Types.ObjectId(columnId), deletedAt: null });
  }

  listForBoard(boardId: string): Promise<BoardColumnDocument[]> {
    return this.model.find({ boardId: new Types.ObjectId(boardId) }).sort({ rank: 1 }).exec();
  }

  async getOrThrow(workspaceId: string, columnId: string): Promise<BoardColumnDocument> {
    const col = await this.model.findOne({ _id: columnId, workspaceId: new Types.ObjectId(workspaceId) }).exec();
    if (!col) throw ApiException.notFound('Column');
    return col;
  }

  async create(
    workspaceId: string,
    boardId: string,
    projectId: string,
    input: { name: string; statusCategory?: StatusCategory; wipLimit?: number; color?: string | null },
  ): Promise<BoardColumnDocument> {
    const last = await this.model.findOne({ boardId: new Types.ObjectId(boardId) }).sort({ rank: -1 }).select('rank').lean();
    return this.model.create({
      workspaceId: new Types.ObjectId(workspaceId),
      boardId: new Types.ObjectId(boardId),
      projectId: new Types.ObjectId(projectId),
      name: input.name.trim(),
      statusCategory: input.statusCategory ?? 'todo',
      color: input.color?.trim() || null,
      wipLimit: input.wipLimit ?? 0,
      rank: rankAfter(last?.rank ?? null),
    });
  }

  async update(
    workspaceId: string,
    columnId: string,
    patch: Partial<{ name: string; statusCategory: StatusCategory; wipLimit: number; color: string | null }>,
  ): Promise<BoardColumnDocument> {
    const col = await this.getOrThrow(workspaceId, columnId);
    if (patch.name !== undefined) col.name = patch.name.trim();
    if (patch.statusCategory !== undefined) col.statusCategory = patch.statusCategory;
    if (patch.wipLimit !== undefined) col.wipLimit = Math.max(0, patch.wipLimit);
    if (patch.color !== undefined) col.color = patch.color?.trim() || null;
    await col.save();
    return col;
  }

  /** Reorder a column between two siblings (ids may be null for an end). */
  async reorder(
    workspaceId: string,
    columnId: string,
    beforeColumnId: string | null,
    afterColumnId: string | null,
  ): Promise<BoardColumnDocument> {
    const col = await this.getOrThrow(workspaceId, columnId);
    const [before, after] = await Promise.all([
      beforeColumnId ? this.model.findById(beforeColumnId).select('rank boardId').lean() : null,
      afterColumnId ? this.model.findById(afterColumnId).select('rank boardId').lean() : null,
    ]);
    if (before && before.boardId.toString() !== col.boardId.toString()) throw ApiException.validation('Neighbour is on a different board.');
    if (after && after.boardId.toString() !== col.boardId.toString()) throw ApiException.validation('Neighbour is on a different board.');
    col.rank = rankBetween(before?.rank ?? null, after?.rank ?? null);
    await col.save();
    return col;
  }

  async remove(workspaceId: string, columnId: string, moveToColumnId?: string | null): Promise<BoardColumnDocument> {
    const col = await this.getOrThrow(workspaceId, columnId);
    const siblings = await this.model.countDocuments({ boardId: col.boardId });
    if (siblings <= 1) throw ApiException.validation('A board must keep at least one column.');

    const taskCount = await this.countTasks(columnId);
    if (taskCount > 0) {
      if (!moveToColumnId) {
        throw ApiException.validation(`This column has ${taskCount} task(s). Provide moveToColumnId to relocate them.`);
      }
      const target = await this.getOrThrow(workspaceId, moveToColumnId);
      if (target.boardId.toString() !== col.boardId.toString()) {
        throw ApiException.validation('Target column is on a different board.');
      }
      await this.tasks.updateMany(
        { columnId: col._id, deletedAt: null },
        { $set: { columnId: target._id } },
      );
    }
    await this.model.deleteOne({ _id: col._id });
    return col;
  }

  toView(col: BoardColumnDocument): ColumnView {
    return {
      id: col.id,
      boardId: col.boardId.toString(),
      name: col.name,
      statusCategory: col.statusCategory,
      color: col.color ?? null,
      rank: col.rank,
      wipLimit: col.wipLimit,
    };
  }
}
