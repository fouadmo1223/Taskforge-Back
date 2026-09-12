import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type RealtimeEvent } from '@flowdesk/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Membership, RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import type { WorkspaceMembershipContext } from '../../common/context/request-context.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { ActivityService } from '../activity/activity.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import {
  ArchiveTaskDto,
  ChecklistItemTextDto,
  ChecklistTitleDto,
  CreateTaskDto,
  MoveTaskDto,
  ReparentTaskDto,
  SetCompletedDto,
  ToggleChecklistItemDto,
  UpdateTaskDto,
} from './dto/task.dto.js';
import { TasksService } from './tasks.service.js';
import { toTaskView, type TaskView } from './task.view.js';
import type { TaskDocument } from './schemas/task.schema.js';

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId/tasks')
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly activity: ActivityService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  private emit(task: TaskDocument, event: RealtimeEvent, payload: Record<string, unknown>, actorId: string): void {
    this.realtime.emitToWorkspace(task.workspaceId.toString(), event, payload, actorId);
  }

  @Get(':taskId')
  @RequirePermissions('task.read')
  @ApiOperation({ summary: 'Get one task' })
  async getOne(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('taskId', ParseObjectIdPipe) taskId: string,
  ): Promise<TaskView> {
    return toTaskView(await this.tasks.getOrThrow(workspaceId, taskId));
  }

  @Get(':taskId/subtree')
  @RequirePermissions('task.read')
  @ApiOperation({ summary: 'Get a task and all of its descendant subtasks (flat, tree-ordered)' })
  async subtree(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('taskId', ParseObjectIdPipe) taskId: string,
  ): Promise<TaskView[]> {
    const [root, tree] = await Promise.all([
      this.tasks.getOrThrow(workspaceId, taskId),
      this.tasks.subtree(workspaceId, taskId),
    ]);
    return [root, ...tree].map(toTaskView);
  }

  @Post()
  @RequirePermissions('task.create')
  @ApiOperation({ summary: 'Create a task (or subtask when parentTaskId is set)' })
  async create(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTaskDto,
  ): Promise<TaskView> {
    const task = await this.tasks.create(workspaceId, userId, dto);
    const view = toTaskView(task);
    this.emit(task, 'task.created', { task: view }, userId);
    this.activity.record({
      workspaceId,
      projectId: task.projectId.toString(),
      taskId: task.id,
      actorUserId: userId,
      verb: task.parentTaskId ? 'subtask.created' : 'task.created',
      entityType: 'task',
      entityId: task.id,
      entityTitle: task.title,
      meta: { key: task.key },
    });
    if (view.assigneeUserIds.length) {
      await this.notifications.notify(view.assigneeUserIds, {
        workspaceId,
        type: 'task.assigned',
        title: `You were assigned ${task.key}`,
        body: task.title,
        actorUserId: userId,
        projectId: task.projectId.toString(),
        taskId: task.id,
        entityType: 'task',
        entityId: task.id,
      });
    }
    return view;
  }

  @Patch(':taskId')
  @RequirePermissions('task.update')
  @ApiOperation({ summary: 'Update task fields' })
  async update(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('taskId', ParseObjectIdPipe) taskId: string,
    @CurrentUser('id') userId: string,
    @Membership() ctx: WorkspaceMembershipContext,
    @Body() dto: UpdateTaskDto,
  ): Promise<TaskView> {
    await this.tasks.assertCanMutate(workspaceId, taskId, ctx);
    const { task, changes } = await this.tasks.update(workspaceId, taskId, dto);
    const view = toTaskView(task);
    this.emit(task, 'task.updated', { task: view, changed: Object.keys(changes.after) }, userId);
    if (Object.keys(changes.after).length) {
      this.activity.record({
        workspaceId,
        projectId: task.projectId.toString(),
        taskId: task.id,
        actorUserId: userId,
        verb: 'task.updated',
        entityType: 'task',
        entityId: task.id,
        entityTitle: task.title,
        meta: { fields: Object.keys(changes.after), before: changes.before, after: changes.after },
      });
    }
    if (changes.addedAssignees.length) {
      await this.notifications.notify(changes.addedAssignees, {
        workspaceId,
        type: 'task.assigned',
        title: `You were assigned ${task.key}`,
        body: task.title,
        actorUserId: userId,
        projectId: task.projectId.toString(),
        taskId: task.id,
        entityType: 'task',
        entityId: task.id,
      });
    }
    return view;
  }

  @Patch(':taskId/move')
  @RequirePermissions('task.move')
  @ApiOperation({ summary: 'Move a task to a column / position (drag and drop)' })
  async move(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('taskId', ParseObjectIdPipe) taskId: string,
    @CurrentUser('id') userId: string,
    @Membership() ctx: WorkspaceMembershipContext,
    @Body() dto: MoveTaskDto,
  ): Promise<TaskView> {
    await this.tasks.assertCanMutate(workspaceId, taskId, ctx);
    const { task, fromColumnId } = await this.tasks.move(workspaceId, taskId, dto);
    const view = toTaskView(task);
    this.emit(task, 'task.moved', { task: view, fromColumnId, toColumnId: view.columnId }, userId);
    if (fromColumnId !== view.columnId) {
      this.activity.record({
        workspaceId,
        projectId: task.projectId.toString(),
        taskId: task.id,
        actorUserId: userId,
        verb: 'task.moved',
        entityType: 'task',
        entityId: task.id,
        entityTitle: task.title,
        meta: { fromColumnId, toColumnId: view.columnId },
      });
      const watchers = [...new Set([...view.assigneeUserIds, view.reporterUserId, ...view.followerUserIds])];
      if (task.completedAt) {
        await this.notifications.notify(watchers, {
          workspaceId,
          type: 'task.completed',
          title: `${task.key} was completed`,
          body: task.title,
          actorUserId: userId,
          projectId: task.projectId.toString(),
          taskId: task.id,
          entityType: 'task',
          entityId: task.id,
        });
      }
    }
    return view;
  }

  @Patch(':taskId/reparent')
  @RequirePermissions('task.update')
  @ApiOperation({ summary: 'Move a task under a new parent (or to top level)' })
  async reparent(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('taskId', ParseObjectIdPipe) taskId: string,
    @CurrentUser('id') userId: string,
    @Membership() ctx: WorkspaceMembershipContext,
    @Body() dto: ReparentTaskDto,
  ): Promise<TaskView> {
    await this.tasks.assertCanMutate(workspaceId, taskId, ctx);
    const task = await this.tasks.reparent(workspaceId, taskId, dto.parentTaskId ?? null);
    const view = toTaskView(task);
    this.emit(task, 'task.updated', { task: view, changed: ['parentTaskId'] }, userId);
    return view;
  }

  @Patch(':taskId/complete')
  @RequirePermissions('task.update')
  @ApiOperation({ summary: 'Mark a task complete / incomplete (moves it between done and active columns)' })
  async complete(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('taskId', ParseObjectIdPipe) taskId: string,
    @CurrentUser('id') userId: string,
    @Membership() ctx: WorkspaceMembershipContext,
    @Body() dto: SetCompletedDto,
  ): Promise<TaskView> {
    await this.tasks.assertCanMutate(workspaceId, taskId, ctx);
    const { task, fromColumnId } = await this.tasks.setCompleted(workspaceId, taskId, dto.completed);
    const view = toTaskView(task);
    this.emit(task, 'task.updated', { task: view, changed: ['completedAt', 'columnId'] }, userId);
    if (fromColumnId !== view.columnId) {
      this.emit(task, 'task.moved', { task: view, fromColumnId, toColumnId: view.columnId }, userId);
    }
    this.activity.record({
      workspaceId,
      projectId: task.projectId.toString(),
      taskId: task.id,
      actorUserId: userId,
      verb: 'task.updated',
      entityType: 'task',
      entityId: task.id,
      entityTitle: task.title,
      meta: { fields: ['completedAt'], after: { completedAt: view.completedAt } },
    });
    return view;
  }

  @Post(':taskId/archive')
  @RequirePermissions('task.update')
  @ApiOperation({ summary: 'Archive or unarchive a task' })
  async archive(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('taskId', ParseObjectIdPipe) taskId: string,
    @CurrentUser('id') userId: string,
    @Membership() ctx: WorkspaceMembershipContext,
    @Body() dto: ArchiveTaskDto,
  ): Promise<TaskView> {
    await this.tasks.assertCanMutate(workspaceId, taskId, ctx);
    const task = await this.tasks.setArchived(workspaceId, taskId, dto.archived);
    const view = toTaskView(task);
    this.emit(task, dto.archived ? 'task.deleted' : 'task.created', { task: view }, userId);
    return view;
  }

  @Delete(':taskId')
  @RequirePermissions('task.delete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Soft-delete a task and its subtasks' })
  async remove(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('taskId', ParseObjectIdPipe) taskId: string,
    @Membership() ctx: WorkspaceMembershipContext,
  ): Promise<{ message: string }> {
    const task = await this.tasks.softDelete(workspaceId, taskId, ctx.userId);
    this.emit(task, 'task.deleted', { taskId: task.id }, ctx.userId);
    this.audit.record({ workspaceId, actorUserId: ctx.userId, action: 'task.delete', entityType: 'task', entityId: task.id, before: { key: task.key, title: task.title } });
    this.activity.record({
      workspaceId,
      projectId: task.projectId.toString(),
      taskId: task.id,
      actorUserId: ctx.userId,
      verb: 'task.deleted',
      entityType: 'task',
      entityId: task.id,
      entityTitle: task.title,
    });
    return { message: 'Task moved to trash.' };
  }

  @Post(':taskId/restore')
  @RequirePermissions('task.delete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Restore a soft-deleted task' })
  async restore(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('taskId', ParseObjectIdPipe) taskId: string,
    @CurrentUser('id') userId: string,
  ): Promise<TaskView> {
    const task = await this.tasks.restore(workspaceId, taskId);
    const view = toTaskView(task);
    this.emit(task, 'task.created', { task: view }, userId);
    return view;
  }

  // ── checklists ──────────────────────────────────────────────────────────

  @Post(':taskId/checklists')
  @RequirePermissions('task.update')
  @ApiOperation({ summary: 'Add a checklist' })
  async addChecklist(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('taskId', ParseObjectIdPipe) taskId: string,
    @CurrentUser('id') userId: string,
    @Membership() ctx: WorkspaceMembershipContext,
    @Body() dto: ChecklistTitleDto,
  ): Promise<TaskView> {
    await this.tasks.assertCanMutate(workspaceId, taskId, ctx);
    const task = await this.tasks.addChecklist(workspaceId, taskId, dto.title);
    const view = toTaskView(task);
    this.emit(task, 'task.updated', { task: view, changed: ['checklists'] }, userId);
    return view;
  }

  @Delete(':taskId/checklists/:checklistId')
  @RequirePermissions('task.update')
  @ApiOperation({ summary: 'Remove a checklist' })
  async removeChecklist(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('taskId', ParseObjectIdPipe) taskId: string,
    @Param('checklistId', ParseObjectIdPipe) checklistId: string,
    @CurrentUser('id') userId: string,
    @Membership() ctx: WorkspaceMembershipContext,
  ): Promise<TaskView> {
    await this.tasks.assertCanMutate(workspaceId, taskId, ctx);
    const task = await this.tasks.removeChecklist(workspaceId, taskId, checklistId);
    const view = toTaskView(task);
    this.emit(task, 'task.updated', { task: view, changed: ['checklists'] }, userId);
    return view;
  }

  @Post(':taskId/checklists/:checklistId/items')
  @RequirePermissions('task.update')
  @ApiOperation({ summary: 'Add a checklist item' })
  async addItem(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('taskId', ParseObjectIdPipe) taskId: string,
    @Param('checklistId', ParseObjectIdPipe) checklistId: string,
    @CurrentUser('id') userId: string,
    @Membership() ctx: WorkspaceMembershipContext,
    @Body() dto: ChecklistItemTextDto,
  ): Promise<TaskView> {
    await this.tasks.assertCanMutate(workspaceId, taskId, ctx);
    const task = await this.tasks.addChecklistItem(workspaceId, taskId, checklistId, dto.text);
    const view = toTaskView(task);
    this.emit(task, 'task.updated', { task: view, changed: ['checklists'] }, userId);
    return view;
  }

  @Patch(':taskId/checklists/:checklistId/items/:itemId')
  @RequirePermissions('task.update')
  @ApiOperation({ summary: 'Toggle a checklist item' })
  async toggleItem(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('taskId', ParseObjectIdPipe) taskId: string,
    @Param('checklistId', ParseObjectIdPipe) checklistId: string,
    @Param('itemId', ParseObjectIdPipe) itemId: string,
    @CurrentUser('id') userId: string,
    @Membership() ctx: WorkspaceMembershipContext,
    @Body() dto: ToggleChecklistItemDto,
  ): Promise<TaskView> {
    await this.tasks.assertCanMutate(workspaceId, taskId, ctx);
    const task = await this.tasks.toggleChecklistItem(workspaceId, taskId, checklistId, itemId, dto.done, userId);
    const view = toTaskView(task);
    this.emit(task, 'task.updated', { task: view, changed: ['checklists'] }, userId);
    return view;
  }

  @Delete(':taskId/checklists/:checklistId/items/:itemId')
  @RequirePermissions('task.update')
  @ApiOperation({ summary: 'Remove a checklist item' })
  async removeItem(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('taskId', ParseObjectIdPipe) taskId: string,
    @Param('checklistId', ParseObjectIdPipe) checklistId: string,
    @Param('itemId', ParseObjectIdPipe) itemId: string,
    @CurrentUser('id') userId: string,
    @Membership() ctx: WorkspaceMembershipContext,
  ): Promise<TaskView> {
    await this.tasks.assertCanMutate(workspaceId, taskId, ctx);
    const task = await this.tasks.removeChecklistItem(workspaceId, taskId, checklistId, itemId);
    const view = toTaskView(task);
    this.emit(task, 'task.updated', { task: view, changed: ['checklists'] }, userId);
    return view;
  }
}
