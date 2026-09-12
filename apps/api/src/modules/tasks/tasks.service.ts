import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import type { Permission, Severity, TaskPriority } from '@flowdesk/types';
import { rankAfter, rankBetween, wouldCreateCycle, buildAdjacency } from '@flowdesk/utils';
import { ApiException } from '../../common/http/api-exception.js';
import { BoardsService } from '../boards/boards.service.js';
import { ColumnsService } from '../columns/columns.service.js';
import { LabelsService } from '../labels/labels.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { Task, type TaskDocument } from './schemas/task.schema.js';

const MAX_DEPTH = 8;

export interface CreateTaskInput {
  projectId: string;
  boardId?: string;
  columnId?: string;
  title: string;
  description?: string;
  type?: string;
  priority?: TaskPriority;
  severity?: Severity | null;
  assigneeUserIds?: string[];
  labelIds?: string[];
  startDate?: string | null;
  dueDate?: string | null;
  estimateHours?: number | null;
  parentTaskId?: string | null;
  milestoneId?: string | null;
  clientVisible?: boolean;
  /** place at top of the column instead of the bottom */
  atTop?: boolean;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  type?: string;
  priority?: TaskPriority;
  severity?: Severity | null;
  assigneeUserIds?: string[];
  followerUserIds?: string[];
  labelIds?: string[];
  startDate?: string | null;
  dueDate?: string | null;
  estimateHours?: number | null;
  milestoneId?: string | null;
  clientVisible?: boolean;
  customFields?: Record<string, unknown>;
}

export interface MoveTaskInput {
  columnId: string;
  beforeTaskId?: string | null;
  afterTaskId?: string | null;
}

export interface TaskChanges {
  before: Partial<Record<string, unknown>>;
  after: Partial<Record<string, unknown>>;
  addedAssignees: string[];
}

@Injectable()
export class TasksService {
  constructor(
    @InjectModel(Task.name) private readonly model: Model<TaskDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly projects: ProjectsService,
    private readonly boards: BoardsService,
    private readonly columns: ColumnsService,
    private readonly labels: LabelsService,
  ) {}

  // ── reads ───────────────────────────────────────────────────────────────

  async getOrThrow(workspaceId: string, taskId: string): Promise<TaskDocument> {
    const task = await this.model
      .findOne({ _id: taskId, workspaceId: new Types.ObjectId(workspaceId), deletedAt: null })
      .exec();
    if (!task) throw ApiException.notFound('Task');
    return task;
  }

  /**
   * A plain `task.update` holder may only change tasks assigned to them (or
   * that they reported/created); owners, holders of `board.manage` (managers),
   * and the task's project lead ("team lead") can change anything.
   */
  async assertCanMutate(
    workspaceId: string,
    taskId: string,
    ctx: { userId: string; isOwner: boolean; permissions: ReadonlySet<Permission> },
  ): Promise<TaskDocument> {
    const task = await this.getOrThrow(workspaceId, taskId);
    if (ctx.isOwner || ctx.permissions.has('board.manage')) return task;

    const uid = new Types.ObjectId(ctx.userId);
    const isMine =
      task.assigneeUserIds.some((id) => id.equals(uid)) ||
      task.reporterUserId.equals(uid) ||
      task.createdByUserId.equals(uid);
    if (isMine) return task;

    const project = await this.projects.getOrThrow(workspaceId, task.projectId.toString());
    if (project.leadUserId?.equals(uid)) return task;

    throw ApiException.forbidden('You can only change tasks assigned to you.');
  }

  /** Board render: top-level (non-subtask) tasks for a board, ordered by column then rank. */
  async listForBoard(workspaceId: string, boardId: string, opts: { clientVisibleOnly?: boolean } = {}): Promise<TaskDocument[]> {
    const filter: Record<string, unknown> = {
      workspaceId: new Types.ObjectId(workspaceId),
      boardId: new Types.ObjectId(boardId),
      parentTaskId: null,
      deletedAt: null,
      archivedAt: null,
    };
    if (opts.clientVisibleOnly) filter.clientVisible = true;
    return this.model.find(filter).sort({ columnId: 1, rank: 1 }).exec();
  }

  async subtree(workspaceId: string, rootTaskId: string): Promise<TaskDocument[]> {
    const root = await this.getOrThrow(workspaceId, rootTaskId);
    // BFS over parentTaskId. Bounded by MAX_DEPTH levels.
    const out: TaskDocument[] = [];
    let frontier = [root._id as Types.ObjectId];
    for (let level = 0; level < MAX_DEPTH && frontier.length > 0; level += 1) {
      const children = await this.model
        .find({ parentTaskId: { $in: frontier }, deletedAt: null })
        .sort({ rank: 1 })
        .exec();
      out.push(...children);
      frontier = children.map((c) => c._id as Types.ObjectId);
    }
    return out;
  }

  async listChildren(parentTaskId: string): Promise<TaskDocument[]> {
    return this.model.find({ parentTaskId: new Types.ObjectId(parentTaskId), deletedAt: null }).sort({ rank: 1 }).exec();
  }

  // ── create ──────────────────────────────────────────────────────────────

  async create(workspaceId: string, userId: string, input: CreateTaskInput): Promise<TaskDocument> {
    const project = await this.projects.getOrThrow(workspaceId, input.projectId);

    const boardId = input.boardId ?? (await this.projects.defaultBoardId(project._id as Types.ObjectId));
    if (!boardId) throw ApiException.unprocessable('Project has no board.');
    const board = await this.boards.getOrThrow(workspaceId, boardId);

    let columnId = input.columnId;
    if (!columnId) {
      const cols = await this.columns.listForBoard(boardId);
      const first = cols.find((c) => c.statusCategory === 'todo') ?? cols[0];
      if (!first) throw ApiException.unprocessable('Board has no columns.');
      columnId = first.id;
    } else {
      const col = await this.columns.getOrThrow(workspaceId, columnId);
      if (col.boardId.toString() !== boardId) throw ApiException.validation('Column does not belong to that board.');
    }

    let parentTaskId: Types.ObjectId | null = null;
    let depth = 0;
    if (input.parentTaskId) {
      const parent = await this.getOrThrow(workspaceId, input.parentTaskId);
      if (parent.depth + 1 >= MAX_DEPTH) throw ApiException.validation(`Subtasks can nest at most ${MAX_DEPTH} levels deep.`);
      parentTaskId = parent._id as Types.ObjectId;
      depth = parent.depth + 1;
    }

    const labelIds = await this.labels.assertValid(workspaceId, input.labelIds ?? []);
    const assigneeUserIds = [...new Set(input.assigneeUserIds ?? [])].map((id) => new Types.ObjectId(id));

    const session = await this.connection.startSession();
    try {
      let task!: TaskDocument;
      await session.withTransaction(async () => {
        const { key } = await this.projects.nextTaskNumber(project._id as Types.ObjectId, session);
        const rank = await this.edgeRank(columnId!, input.atTop ? 'top' : 'bottom');
        const [created] = await this.model.create(
          [
            {
              workspaceId: project.workspaceId,
              projectId: project._id,
              boardId: board._id,
              columnId: new Types.ObjectId(columnId),
              key,
              title: input.title.trim(),
              description: input.description ?? '',
              type: input.type ?? 'task',
              priority: input.priority ?? 'none',
              severity: input.severity ?? null,
              assigneeUserIds,
              reporterUserId: new Types.ObjectId(userId),
              followerUserIds: [new Types.ObjectId(userId)],
              labelIds,
              startDate: input.startDate ? new Date(input.startDate) : null,
              dueDate: input.dueDate ? new Date(input.dueDate) : null,
              estimateHours: input.estimateHours ?? null,
              parentTaskId,
              depth,
              milestoneId: input.milestoneId ? new Types.ObjectId(input.milestoneId) : null,
              clientVisible: input.clientVisible ?? false,
              rank,
              createdByUserId: new Types.ObjectId(userId),
            },
          ],
          { session },
        );
        task = created!;
        if (parentTaskId) {
          await this.model.updateOne({ _id: parentTaskId }, { $inc: { subtaskCount: 1 } }, { session });
        }
      });
      return task;
    } finally {
      await session.endSession();
    }
  }

  // ── update ──────────────────────────────────────────────────────────────

  async update(workspaceId: string, taskId: string, input: UpdateTaskInput): Promise<{ task: TaskDocument; changes: TaskChanges }> {
    const task = await this.getOrThrow(workspaceId, taskId);
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const prevAssignees = new Set(task.assigneeUserIds.map((id) => id.toString()));

    const track = (field: string, prev: unknown, next: unknown): void => {
      before[field] = prev;
      after[field] = next;
    };

    if (input.title !== undefined && input.title.trim() !== task.title) {
      track('title', task.title, input.title.trim());
      task.title = input.title.trim();
    }
    if (input.description !== undefined) task.description = input.description;
    if (input.type !== undefined && input.type !== task.type) {
      track('type', task.type, input.type);
      task.type = input.type;
    }
    if (input.priority !== undefined && input.priority !== task.priority) {
      track('priority', task.priority, input.priority);
      task.priority = input.priority;
    }
    if (input.severity !== undefined) task.severity = input.severity;
    if (input.startDate !== undefined) {
      track('startDate', task.startDate?.toISOString() ?? null, input.startDate);
      task.startDate = input.startDate ? new Date(input.startDate) : null;
    }
    if (input.dueDate !== undefined) {
      track('dueDate', task.dueDate?.toISOString() ?? null, input.dueDate);
      task.dueDate = input.dueDate ? new Date(input.dueDate) : null;
    }
    if (input.estimateHours !== undefined) {
      track('estimateHours', task.estimateHours, input.estimateHours);
      task.estimateHours = input.estimateHours;
    }
    if (input.clientVisible !== undefined && input.clientVisible !== task.clientVisible) {
      track('clientVisible', task.clientVisible, input.clientVisible);
      task.clientVisible = input.clientVisible;
    }
    if (input.customFields !== undefined) task.customFields = { ...task.customFields, ...input.customFields };
    if (input.milestoneId !== undefined) {
      track('milestoneId', task.milestoneId?.toString() ?? null, input.milestoneId ?? null);
      task.milestoneId = input.milestoneId ? new Types.ObjectId(input.milestoneId) : null;
    }
    if (input.labelIds !== undefined) {
      task.labelIds = await this.labels.assertValid(workspaceId, input.labelIds);
      after.labelIds = input.labelIds;
    }
    if (input.followerUserIds !== undefined) {
      task.followerUserIds = [...new Set(input.followerUserIds)].map((id) => new Types.ObjectId(id));
    }
    if (input.assigneeUserIds !== undefined) {
      task.assigneeUserIds = [...new Set(input.assigneeUserIds)].map((id) => new Types.ObjectId(id));
      before.assigneeUserIds = [...prevAssignees];
      after.assigneeUserIds = task.assigneeUserIds.map((id) => id.toString());
      // followers gain any new assignee
      const followerSet = new Set(task.followerUserIds.map((id) => id.toString()));
      for (const a of task.assigneeUserIds) followerSet.add(a.toString());
      task.followerUserIds = [...followerSet].map((id) => new Types.ObjectId(id));
    }

    await task.save();

    const addedAssignees = (input.assigneeUserIds ?? []).filter((id) => !prevAssignees.has(id));
    return { task, changes: { before, after, addedAssignees } };
  }

  // ── move / reorder ──────────────────────────────────────────────────────

  async move(workspaceId: string, taskId: string, input: MoveTaskInput): Promise<{ task: TaskDocument; fromColumnId: string }> {
    const task = await this.getOrThrow(workspaceId, taskId);
    const fromColumnId = task.columnId.toString();
    const targetColumn = await this.columns.getOrThrow(workspaceId, input.columnId);
    if (targetColumn.boardId.toString() !== task.boardId.toString()) {
      throw ApiException.validation('Target column is on a different board.');
    }

    const [before, after] = await Promise.all([
      input.beforeTaskId ? this.model.findById(input.beforeTaskId).select('rank columnId').lean() : null,
      input.afterTaskId ? this.model.findById(input.afterTaskId).select('rank columnId').lean() : null,
    ]);
    for (const n of [before, after]) {
      if (n && n.columnId.toString() !== input.columnId) {
        throw ApiException.validation('A neighbour is not in the target column.');
      }
    }

    let newRank: string;
    if (!before && !after) {
      newRank = await this.edgeRank(input.columnId, 'bottom');
    } else {
      newRank = rankBetween(before?.rank ?? null, after?.rank ?? null);
    }

    task.columnId = targetColumn._id as Types.ObjectId;
    task.rank = newRank;
    const wasComplete = Boolean(task.completedAt);
    if (targetColumn.statusCategory === 'done') {
      if (!task.completedAt) task.completedAt = new Date();
    } else {
      task.completedAt = null;
    }
    await task.save();
    if (task.parentTaskId && wasComplete !== Boolean(task.completedAt)) {
      await this.model.updateOne({ _id: task.parentTaskId }, { $inc: { subtaskDoneCount: task.completedAt ? 1 : -1 } });
    }
    return { task, fromColumnId };
  }

  /**
   * Toggle a task's completion without a drag. Mirrors the board rule: a
   * completed task lands in a `done` column, an un-completed one goes back to
   * the first non-done column (preferring `in_progress`, then `todo`).
   */
  async setCompleted(workspaceId: string, taskId: string, completed: boolean): Promise<{ task: TaskDocument; fromColumnId: string }> {
    const task = await this.getOrThrow(workspaceId, taskId);
    const fromColumnId = task.columnId.toString();
    const cols = await this.columns.listForBoard(task.boardId.toString());
    const current = cols.find((c) => c.id === fromColumnId);

    let target = current;
    if (completed && current?.statusCategory !== 'done') {
      target = cols.find((c) => c.statusCategory === 'done') ?? current;
    } else if (!completed && current?.statusCategory === 'done') {
      target =
        cols.find((c) => c.statusCategory === 'in_progress') ??
        cols.find((c) => c.statusCategory === 'todo') ??
        cols.find((c) => c.statusCategory !== 'done') ??
        current;
    }

    if (target && target.id !== fromColumnId) {
      task.columnId = target._id as Types.ObjectId;
      task.rank = await this.edgeRank(target.id, 'bottom');
    }
    const wasComplete = Boolean(task.completedAt);
    task.completedAt = completed ? (task.completedAt ?? new Date()) : null;
    await task.save();
    if (task.parentTaskId && wasComplete !== Boolean(task.completedAt)) {
      await this.model.updateOne({ _id: task.parentTaskId }, { $inc: { subtaskDoneCount: task.completedAt ? 1 : -1 } });
    }
    return { task, fromColumnId };
  }

  // ── lifecycle ───────────────────────────────────────────────────────────

  async setArchived(workspaceId: string, taskId: string, archived: boolean): Promise<TaskDocument> {
    const task = await this.getOrThrow(workspaceId, taskId);
    task.archivedAt = archived ? new Date() : null;
    await task.save();
    return task;
  }

  async softDelete(workspaceId: string, taskId: string, userId: string): Promise<TaskDocument> {
    const task = await this.getOrThrow(workspaceId, taskId);
    const now = new Date();
    // cascade to descendants
    const tree = await this.subtree(workspaceId, taskId);
    const ids = [task._id, ...tree.map((t) => t._id)];
    await this.model.updateMany({ _id: { $in: ids } }, { $set: { deletedAt: now, deletedBy: new Types.ObjectId(userId) } });
    if (task.parentTaskId) {
      await this.model.updateOne(
        { _id: task.parentTaskId },
        { $inc: { subtaskCount: -1, ...(task.completedAt ? { subtaskDoneCount: -1 } : {}) } },
      );
    }
    task.deletedAt = now;
    return task;
  }

  async restore(workspaceId: string, taskId: string): Promise<TaskDocument> {
    const task = await this.model.findOne({ _id: taskId, workspaceId: new Types.ObjectId(workspaceId), deletedAt: { $ne: null } });
    if (!task) throw ApiException.notFound('Task');
    task.deletedAt = null;
    task.deletedBy = null;
    await task.save();
    if (task.parentTaskId) {
      await this.model.updateOne(
        { _id: task.parentTaskId },
        { $inc: { subtaskCount: 1, ...(task.completedAt ? { subtaskDoneCount: 1 } : {}) } },
      );
    }
    return task;
  }

  // ── subtask reparent (loop-safe) ────────────────────────────────────────

  async reparent(workspaceId: string, taskId: string, newParentId: string | null): Promise<TaskDocument> {
    const task = await this.getOrThrow(workspaceId, taskId);
    const oldParentId = task.parentTaskId?.toString() ?? null;
    if (oldParentId === newParentId) return task;

    let depth = 0;
    if (newParentId) {
      if (newParentId === taskId) throw ApiException.validation('A task cannot be its own parent.');
      const newParent = await this.getOrThrow(workspaceId, newParentId);
      // build the current parent graph and check the new edge for a cycle
      const all = await this.model
        .find({ workspaceId: new Types.ObjectId(workspaceId), parentTaskId: { $ne: null }, deletedAt: null })
        .select('_id parentTaskId')
        .lean();
      const edges: Array<[string, string]> = all.map((t) => [t.parentTaskId!.toString(), t._id.toString()]);
      const adj = buildAdjacency(edges);
      if (wouldCreateCycle(adj, newParentId, taskId)) {
        throw ApiException.validation('That move would create a cycle in the subtask tree.');
      }
      if (newParent.depth + 1 >= MAX_DEPTH) throw ApiException.validation(`Subtasks can nest at most ${MAX_DEPTH} levels deep.`);
      task.parentTaskId = newParent._id as Types.ObjectId;
      depth = newParent.depth + 1;
    } else {
      task.parentTaskId = null;
    }
    task.depth = depth;
    task.rank = await this.edgeRank(task.columnId.toString(), 'bottom');
    await task.save();

    const doneInc = task.completedAt ? 1 : 0;
    if (oldParentId) await this.model.updateOne({ _id: oldParentId }, { $inc: { subtaskCount: -1, subtaskDoneCount: -doneInc } });
    if (newParentId) await this.model.updateOne({ _id: newParentId }, { $inc: { subtaskCount: 1, subtaskDoneCount: doneInc } });
    // fix descendant depths (one level shift)
    await this.reindexDepth(task._id as Types.ObjectId, depth);
    return task;
  }

  private async reindexDepth(rootId: Types.ObjectId, rootDepth: number): Promise<void> {
    let frontier: Array<{ id: Types.ObjectId; depth: number }> = [{ id: rootId, depth: rootDepth }];
    for (let level = 0; level < MAX_DEPTH && frontier.length > 0; level += 1) {
      const parentIds = frontier.map((f) => f.id);
      const children = await this.model.find({ parentTaskId: { $in: parentIds }, deletedAt: null }).select('_id parentTaskId').lean();
      if (children.length === 0) break;
      const depthByParent = new Map(frontier.map((f) => [f.id.toString(), f.depth]));
      const ops = children.map((c) => ({
        updateOne: {
          filter: { _id: c._id },
          update: { $set: { depth: (depthByParent.get(c.parentTaskId!.toString()) ?? 0) + 1 } },
        },
      }));
      await this.model.bulkWrite(ops);
      frontier = children.map((c) => ({ id: c._id as Types.ObjectId, depth: (depthByParent.get(c.parentTaskId!.toString()) ?? 0) + 1 }));
    }
  }

  // ── checklists ──────────────────────────────────────────────────────────

  async addChecklist(workspaceId: string, taskId: string, title: string): Promise<TaskDocument> {
    const task = await this.getOrThrow(workspaceId, taskId);
    const last = task.checklists.at(-1)?.rank ?? null;
    task.checklists.push({ _id: new Types.ObjectId(), title: title.trim(), items: [], rank: rankAfter(last) } as never);
    await task.save();
    return task;
  }

  async removeChecklist(workspaceId: string, taskId: string, checklistId: string): Promise<TaskDocument> {
    const task = await this.getOrThrow(workspaceId, taskId);
    task.checklists = task.checklists.filter((c) => c._id.toString() !== checklistId);
    await task.save();
    return task;
  }

  async addChecklistItem(workspaceId: string, taskId: string, checklistId: string, text: string): Promise<TaskDocument> {
    const task = await this.getOrThrow(workspaceId, taskId);
    const checklist = task.checklists.find((c) => c._id.toString() === checklistId);
    if (!checklist) throw ApiException.notFound('Checklist');
    const last = checklist.items.at(-1)?.rank ?? null;
    checklist.items.push({
      _id: new Types.ObjectId(),
      text: text.trim(),
      done: false,
      doneByUserId: null,
      doneAt: null,
      rank: rankAfter(last),
    } as never);
    await task.save();
    return task;
  }

  async toggleChecklistItem(
    workspaceId: string,
    taskId: string,
    checklistId: string,
    itemId: string,
    done: boolean,
    userId: string,
  ): Promise<TaskDocument> {
    const task = await this.getOrThrow(workspaceId, taskId);
    const checklist = task.checklists.find((c) => c._id.toString() === checklistId);
    const item = checklist?.items.find((i) => i._id.toString() === itemId);
    if (!item) throw ApiException.notFound('Checklist item');
    item.done = done;
    item.doneByUserId = done ? new Types.ObjectId(userId) : null;
    item.doneAt = done ? new Date() : null;
    await task.save();
    return task;
  }

  async removeChecklistItem(workspaceId: string, taskId: string, checklistId: string, itemId: string): Promise<TaskDocument> {
    const task = await this.getOrThrow(workspaceId, taskId);
    const checklist = task.checklists.find((c) => c._id.toString() === checklistId);
    if (!checklist) throw ApiException.notFound('Checklist');
    checklist.items = checklist.items.filter((i) => i._id.toString() !== itemId);
    await task.save();
    return task;
  }

  // ── counters (used by comments / attachments modules) ────────────────────

  async bumpCounter(taskId: string, field: 'commentCount' | 'attachmentCount', delta: number): Promise<void> {
    await this.model.updateOne({ _id: new Types.ObjectId(taskId) }, { $inc: { [field]: delta } });
  }

  async workspaceIdOf(taskId: string): Promise<string | null> {
    if (!Types.ObjectId.isValid(taskId)) return null;
    const t = await this.model.findById(taskId).select('workspaceId deletedAt').lean();
    if (!t || t.deletedAt) return null;
    return t.workspaceId.toString();
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private async edgeRank(columnId: string, edge: 'top' | 'bottom'): Promise<string> {
    const sort = edge === 'bottom' ? -1 : 1;
    const neighbour = await this.model
      .findOne({ columnId: new Types.ObjectId(columnId), deletedAt: null })
      .sort({ rank: sort })
      .select('rank')
      .lean();
    return edge === 'bottom' ? rankAfter(neighbour?.rank ?? null) : rankBetween(null, neighbour?.rank ?? null);
  }
}
