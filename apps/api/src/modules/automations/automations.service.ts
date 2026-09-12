import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AutomationTrigger, WebhookEvent } from '@flowdesk/types';
import { ApiException } from '../../common/http/api-exception.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { WebhooksService } from '../webhooks/webhooks.service.js';
import { CommentsService } from '../comments/comments.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { BoardColumn, type BoardColumnDocument } from '../columns/schemas/board-column.schema.js';
import { Task, type TaskDocument } from '../tasks/schemas/task.schema.js';
import {
  Automation,
  AutomationRun,
  type AutomationDocument,
  type AutomationRunDocument,
} from './schemas/automation.schema.js';

/** Facts an automation's conditions/actions can read. */
export interface AutomationContext {
  taskId?: string;
  projectId?: string;
  priority?: string;
  title?: string;
  statusCategory?: string;
  assigneeCount?: number;
  labelCount?: number;
  dueInDays?: number | null;
  [k: string]: unknown;
}

export interface AutomationView {
  id: string;
  name: string;
  active: boolean;
  projectId: string | null;
  trigger: { type: AutomationTrigger; config: Record<string, unknown> };
  conditions: { field: string; op: string; value: unknown }[];
  actions: { id: string; type: string; config: Record<string, unknown> }[];
  runCount: number;
  lastRunAt: string | null;
  lastError: string;
  createdAt: string;
}

const SCHEDULED_TRIGGERS: AutomationTrigger[] = ['schedule', 'task.overdue', 'task.due_soon'];

/** Coerce an untyped config value to a trimmed string; non-primitives → ''. */
function cfgStr(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '';
}

@Injectable()
export class AutomationsService {
  private readonly logger = new Logger('AutomationsService');

  constructor(
    @InjectModel(Automation.name) private readonly model: Model<AutomationDocument>,
    @InjectModel(AutomationRun.name) private readonly runs: Model<AutomationRunDocument>,
    @InjectModel(Task.name) private readonly tasks: Model<TaskDocument>,
    @InjectModel(BoardColumn.name) private readonly columns: Model<BoardColumnDocument>,
    private readonly tasksService: TasksService,
    private readonly comments: CommentsService,
    private readonly notifications: NotificationsService,
    private readonly webhooks: WebhooksService,
  ) {}

  // ── CRUD ────────────────────────────────────────────────────────────────

  list(workspaceId: string, projectId?: string): Promise<AutomationDocument[]> {
    const filter: Record<string, unknown> = { workspaceId: new Types.ObjectId(workspaceId) };
    if (projectId) filter.$or = [{ projectId: new Types.ObjectId(projectId) }, { projectId: null }];
    return this.model.find(filter).sort({ createdAt: -1 }).exec();
  }

  async getOrThrow(workspaceId: string, id: string): Promise<AutomationDocument> {
    const doc = await this.model.findOne({ _id: id, workspaceId: new Types.ObjectId(workspaceId) }).exec();
    if (!doc) throw ApiException.notFound('Automation');
    return doc;
  }

  create(
    workspaceId: string,
    userId: string,
    input: {
      name: string;
      projectId?: string | null;
      trigger: { type: AutomationTrigger; config?: Record<string, unknown> };
      conditions?: { field: string; op: string; value?: unknown }[];
      actions?: { type: string; config?: Record<string, unknown> }[];
      active?: boolean;
    },
  ): Promise<AutomationDocument> {
    if (!input.actions || input.actions.length === 0) throw ApiException.validation('Add at least one action.');
    return this.model.create({
      workspaceId: new Types.ObjectId(workspaceId),
      name: input.name.trim(),
      active: input.active ?? true,
      projectId: input.projectId ? new Types.ObjectId(input.projectId) : null,
      trigger: { type: input.trigger.type, config: input.trigger.config ?? {} },
      conditions: input.conditions ?? [],
      actions: (input.actions ?? []).map((a) => ({ _id: new Types.ObjectId(), type: a.type, config: a.config ?? {} })),
      createdByUserId: new Types.ObjectId(userId),
    });
  }

  async update(
    workspaceId: string,
    id: string,
    patch: Partial<{
      name: string;
      active: boolean;
      projectId: string | null;
      trigger: { type: AutomationTrigger; config?: Record<string, unknown> };
      conditions: { field: string; op: string; value?: unknown }[];
      actions: { type: string; config?: Record<string, unknown> }[];
    }>,
  ): Promise<AutomationDocument> {
    const doc = await this.getOrThrow(workspaceId, id);
    if (patch.name !== undefined) doc.name = patch.name.trim();
    if (patch.active !== undefined) doc.active = patch.active;
    if (patch.projectId !== undefined) doc.projectId = patch.projectId ? new Types.ObjectId(patch.projectId) : null;
    if (patch.trigger !== undefined) {
      doc.trigger = { type: patch.trigger.type, config: patch.trigger.config ?? {} } as AutomationDocument['trigger'];
    }
    if (patch.conditions !== undefined) doc.conditions = patch.conditions as AutomationDocument['conditions'];
    if (patch.actions !== undefined) {
      if (patch.actions.length === 0) throw ApiException.validation('Add at least one action.');
      doc.actions = patch.actions.map((a) => ({
        _id: new Types.ObjectId(),
        type: a.type,
        config: a.config ?? {},
      })) as AutomationDocument['actions'];
    }
    await doc.save();
    return doc;
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const doc = await this.getOrThrow(workspaceId, id);
    await this.model.deleteOne({ _id: doc._id });
    await this.runs.deleteMany({ automationId: doc._id });
  }

  recentRuns(automationId: string): Promise<AutomationRunDocument[]> {
    return this.runs.find({ automationId: new Types.ObjectId(automationId) }).sort({ createdAt: -1 }).limit(50).exec();
  }

  // ── execution ───────────────────────────────────────────────────────────

  /**
   * Fire an event at the automations for a workspace. Fire-and-forget — safe to
   * call from any service without awaiting. (Not yet wired into task mutations;
   * `runScheduled` and the test endpoint are the live entry points for v1.)
   */
  dispatch(workspaceId: string, trigger: AutomationTrigger, ctx: AutomationContext, actorUserId: string): void {
    void this.model
      .find({ workspaceId: new Types.ObjectId(workspaceId), active: true, 'trigger.type': trigger })
      .then((autos) =>
        Promise.all(
          autos
            .filter((a) => !a.projectId || a.projectId.toString() === ctx.projectId)
            .map((a) => this.execute(a, ctx, actorUserId, trigger)),
        ),
      )
      .catch((err) => this.logger.error(`dispatch(${trigger}) failed: ${String(err)}`));
  }

  /** Evaluate time-based automations against current tasks. Pull-based. */
  async runScheduled(workspaceId: string, userId: string): Promise<{ automations: number; executed: number }> {
    const autos = await this.model
      .find({ workspaceId: new Types.ObjectId(workspaceId), active: true, 'trigger.type': { $in: SCHEDULED_TRIGGERS } })
      .exec();

    let executed = 0;
    for (const auto of autos) {
      if (auto.trigger.type === 'schedule') {
        await this.execute(auto, { projectId: auto.projectId?.toString() }, userId, 'schedule');
        executed += 1;
        continue;
      }
      // task.overdue / task.due_soon → find matching tasks
      const now = Date.now();
      const soonDays = Number(auto.trigger.config?.withinDays ?? 2);
      const taskFilter: Record<string, unknown> = {
        workspaceId: new Types.ObjectId(workspaceId),
        deletedAt: null,
        archivedAt: null,
        dueDate: { $ne: null },
      };
      if (auto.projectId) taskFilter.projectId = auto.projectId;
      const candidates = await this.tasks.find(taskFilter).select('projectId columnId priority title dueDate assigneeUserIds labelIds').lean();
      for (const task of candidates) {
        const due = new Date(task.dueDate as Date).getTime();
        const overdue = due < now;
        const dueSoon = !overdue && due - now <= soonDays * 86_400_000;
        if ((auto.trigger.type === 'task.overdue' && overdue) || (auto.trigger.type === 'task.due_soon' && dueSoon)) {
          const ctx = await this.taskContext(task._id.toString());
          if (ctx) {
            await this.execute(auto, ctx, userId, auto.trigger.type);
            executed += 1;
          }
        }
      }
    }
    return { automations: autos.length, executed };
  }

  async test(workspaceId: string, id: string, userId: string, ctx: AutomationContext): Promise<AutomationRunDocument> {
    const auto = await this.getOrThrow(workspaceId, id);
    return this.execute(auto, ctx, userId, 'test');
  }

  private async taskContext(taskId: string): Promise<AutomationContext | null> {
    const task = await this.tasks.findById(taskId).lean();
    if (!task) return null;
    const col = await this.columns.findById(task.columnId).select('statusCategory').lean();
    const dueInDays = task.dueDate
      ? Math.round((new Date(task.dueDate).getTime() - Date.now()) / 86_400_000)
      : null;
    return {
      taskId: task._id.toString(),
      projectId: task.projectId.toString(),
      priority: task.priority,
      title: task.title,
      statusCategory: col?.statusCategory ?? 'todo',
      assigneeCount: task.assigneeUserIds?.length ?? 0,
      labelCount: task.labelIds?.length ?? 0,
      dueInDays,
    };
  }

  private conditionsPass(conds: AutomationDocument['conditions'], ctx: AutomationContext): boolean {
    return conds.every((c) => {
      const actual = ctx[c.field];
      switch (c.op) {
        case 'eq':
          return actual === c.value;
        case 'neq':
          return actual !== c.value;
        case 'contains':
          return typeof actual === 'string' && actual.toLowerCase().includes(String(c.value).toLowerCase());
        case 'gt':
          return typeof actual === 'number' && actual > Number(c.value);
        case 'lt':
          return typeof actual === 'number' && actual < Number(c.value);
        case 'is_empty':
          return actual === null || actual === undefined || actual === '' || actual === 0;
        case 'is_set':
          return !(actual === null || actual === undefined || actual === '');
        default:
          return false;
      }
    });
  }

  private async execute(
    auto: AutomationDocument,
    ctx: AutomationContext,
    userId: string,
    trigger: string,
  ): Promise<AutomationRunDocument> {
    if (!this.conditionsPass(auto.conditions, ctx)) {
      return this.runs.create({
        automationId: auto._id,
        workspaceId: auto.workspaceId,
        status: 'skipped',
        trigger,
        subjectTaskId: ctx.taskId ? new Types.ObjectId(ctx.taskId) : null,
      });
    }

    const workspaceId = auto.workspaceId.toString();
    const ran: string[] = [];
    let failed = false;
    let error = '';

    for (const action of auto.actions) {
      try {
        await this.runAction(workspaceId, action.type, action.config, ctx, userId);
        ran.push(action.type);
      } catch (err) {
        failed = true;
        error = err instanceof Error ? err.message : String(err);
        this.logger.warn(`automation ${auto.id} action ${action.type} failed: ${error}`);
      }
    }

    auto.runCount += 1;
    auto.lastRunAt = new Date();
    auto.lastError = failed ? error : '';
    await auto.save();

    this.webhooks.dispatch(workspaceId, 'automation.executed' as WebhookEvent, {
      automationId: auto.id,
      name: auto.name,
      trigger,
      actions: ran,
    });

    return this.runs.create({
      automationId: auto._id,
      workspaceId: auto.workspaceId,
      status: failed ? (ran.length > 0 ? 'partial' : 'failed') : 'success',
      trigger,
      actionsRun: ran,
      error,
      subjectTaskId: ctx.taskId ? new Types.ObjectId(ctx.taskId) : null,
    });
  }

  private async runAction(
    workspaceId: string,
    type: string,
    config: Record<string, unknown>,
    ctx: AutomationContext,
    userId: string,
  ): Promise<void> {
    switch (type) {
      case 'set_field': {
        if (!ctx.taskId) return;
        const patch: { priority?: never; dueDate?: string } = {};
        if (config.priority) patch.priority = config.priority as never;
        if (config.dueInDays !== undefined && config.dueInDays !== null) {
          patch.dueDate = new Date(Date.now() + Number(config.dueInDays) * 86_400_000).toISOString();
        }
        if (Object.keys(patch).length > 0) await this.tasksService.update(workspaceId, ctx.taskId, patch);
        return;
      }
      case 'assign_user': {
        const userIdCfg = cfgStr(config.userId);
        if (!ctx.taskId || !userIdCfg) return;
        await this.tasksService.update(workspaceId, ctx.taskId, { assigneeUserIds: [userIdCfg] });
        return;
      }
      case 'move_task': {
        const columnId = cfgStr(config.columnId);
        if (!ctx.taskId || !columnId) return;
        await this.tasksService.move(workspaceId, ctx.taskId, { columnId });
        return;
      }
      case 'create_task': {
        const projectId = cfgStr(config.projectId) || ctx.projectId || '';
        const title = cfgStr(config.title);
        if (!projectId || !title) return;
        await this.tasksService.create(workspaceId, userId, {
          projectId,
          columnId: cfgStr(config.columnId) || undefined,
          title,
          priority: (config.priority as never) ?? 'none',
        });
        return;
      }
      case 'add_comment': {
        const body = cfgStr(config.body);
        if (!ctx.taskId || !body) return;
        await this.comments.create(workspaceId, userId, ctx.taskId, {
          bodyHtml: `<p>${body}</p>`,
          visibility: 'internal',
        });
        return;
      }
      case 'send_notification': {
        const recipients = Array.isArray(config.userIds) ? config.userIds.map(cfgStr).filter(Boolean) : [];
        if (recipients.length === 0) return;
        await this.notifications.notify(recipients, {
          workspaceId,
          type: 'automation.notified',
          title: cfgStr(config.title) || 'Automation',
          body: cfgStr(config.body) || null,
          projectId: ctx.projectId ?? null,
          taskId: ctx.taskId ?? null,
          entityType: 'task',
          entityId: ctx.taskId ?? null,
        });
        return;
      }
      case 'call_webhook': {
        this.webhooks.dispatch(workspaceId, 'automation.executed' as WebhookEvent, { custom: config, context: ctx });
        return;
      }
      default:
        // request_approval / create_subtask / apply_template — accepted, no-op in v1
        return;
    }
  }

  toView(a: AutomationDocument): AutomationView {
    return {
      id: a.id,
      name: a.name,
      active: a.active,
      projectId: a.projectId?.toString() ?? null,
      trigger: { type: a.trigger.type, config: a.trigger.config },
      conditions: a.conditions.map((c) => ({ field: c.field, op: c.op, value: c.value })),
      actions: a.actions.map((x) => ({ id: x._id.toString(), type: x.type, config: x.config })),
      runCount: a.runCount,
      lastRunAt: a.lastRunAt?.toISOString() ?? null,
      lastError: a.lastError,
      createdAt: a.createdAt.toISOString(),
    };
  }
}
