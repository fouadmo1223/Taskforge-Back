import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { TaskPriority, TemplateKind } from '@flowdesk/types';
import { ApiException } from '../../common/http/api-exception.js';
import { ProjectsService } from '../projects/projects.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { Template, type TemplateDocument } from './schemas/template.schema.js';

export interface TaskNode {
  title: string;
  description?: string;
  priority?: TaskPriority;
  estimateHours?: number;
  subtasks?: TaskNode[];
}

export interface TemplateView {
  id: string;
  kind: TemplateKind;
  name: string;
  description: string;
  payload: Record<string, unknown>;
  useCount: number;
  createdAt: string;
}

const MAX_NODES = 200;

@Injectable()
export class TemplatesService {
  constructor(
    @InjectModel(Template.name) private readonly model: Model<TemplateDocument>,
    private readonly projects: ProjectsService,
    private readonly tasks: TasksService,
  ) {}

  list(workspaceId: string, kind?: TemplateKind): Promise<TemplateDocument[]> {
    const filter: Record<string, unknown> = { workspaceId: new Types.ObjectId(workspaceId) };
    if (kind) filter.kind = kind;
    return this.model.find(filter).sort({ name: 1 }).exec();
  }

  async getOrThrow(workspaceId: string, id: string): Promise<TemplateDocument> {
    const doc = await this.model.findOne({ _id: id, workspaceId: new Types.ObjectId(workspaceId) }).exec();
    if (!doc) throw ApiException.notFound('Template');
    return doc;
  }

  create(
    workspaceId: string,
    userId: string,
    input: { kind: TemplateKind; name: string; description?: string; payload: Record<string, unknown> },
  ): Promise<TemplateDocument> {
    this.assertNodeCount(input.payload);
    return this.model.create({
      workspaceId: new Types.ObjectId(workspaceId),
      kind: input.kind,
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      payload: input.payload ?? {},
      createdByUserId: new Types.ObjectId(userId),
    });
  }

  async update(
    workspaceId: string,
    id: string,
    patch: Partial<{ name: string; description: string; payload: Record<string, unknown> }>,
  ): Promise<TemplateDocument> {
    const doc = await this.getOrThrow(workspaceId, id);
    if (patch.name !== undefined) doc.name = patch.name.trim();
    if (patch.description !== undefined) doc.description = patch.description.trim();
    if (patch.payload !== undefined) {
      this.assertNodeCount(patch.payload);
      doc.payload = patch.payload;
    }
    await doc.save();
    return doc;
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const doc = await this.getOrThrow(workspaceId, id);
    await this.model.deleteOne({ _id: doc._id });
  }

  // ── instantiation ───────────────────────────────────────────────────────

  async instantiateTask(
    workspaceId: string,
    id: string,
    userId: string,
    opts: { projectId: string; columnId?: string },
  ): Promise<{ rootTaskId: string; created: number }> {
    const tpl = await this.getOrThrow(workspaceId, id);
    if (tpl.kind !== 'task') throw ApiException.validation('This template is not a task template.');
    const payload = tpl.payload as unknown as TaskNode;
    if (!payload.title) throw ApiException.validation('Template payload has no title.');

    const counter = { n: 0 };
    const rootId = await this.spawnNode(workspaceId, userId, opts.projectId, payload, null, opts.columnId, counter);
    await this.model.updateOne({ _id: tpl._id }, { $inc: { useCount: 1 } });
    return { rootTaskId: rootId, created: counter.n };
  }

  async instantiateProject(
    workspaceId: string,
    id: string,
    userId: string,
    opts: { name: string; key?: string },
  ): Promise<{ projectId: string; created: number }> {
    const tpl = await this.getOrThrow(workspaceId, id);
    if (tpl.kind !== 'project') throw ApiException.validation('This template is not a project template.');
    const payload = tpl.payload as { tasks?: TaskNode[] };

    const project = await this.projects.create(workspaceId, userId, { name: opts.name, key: opts.key });
    const counter = { n: 0 };
    for (const node of payload.tasks ?? []) {
      await this.spawnNode(workspaceId, userId, project.id, node, null, undefined, counter);
    }
    await this.model.updateOne({ _id: tpl._id }, { $inc: { useCount: 1 } });
    return { projectId: project.id, created: counter.n };
  }

  private async spawnNode(
    workspaceId: string,
    userId: string,
    projectId: string,
    node: TaskNode,
    parentTaskId: string | null,
    columnId: string | undefined,
    counter: { n: number },
  ): Promise<string> {
    if (counter.n >= MAX_NODES) throw ApiException.validation(`Templates can create at most ${MAX_NODES} tasks.`);
    const task = await this.tasks.create(workspaceId, userId, {
      projectId,
      columnId,
      parentTaskId: parentTaskId ?? undefined,
      title: node.title,
      description: node.description ? `<p>${node.description}</p>` : '',
      priority: node.priority ?? 'none',
    });
    counter.n += 1;
    for (const child of node.subtasks ?? []) {
      await this.spawnNode(workspaceId, userId, projectId, child, task.id, undefined, counter);
    }
    return task.id;
  }

  private assertNodeCount(payload: Record<string, unknown>): void {
    let n = 0;
    const walk = (node: Partial<TaskNode> | undefined): void => {
      if (!node) return;
      n += 1;
      for (const c of node.subtasks ?? []) walk(c);
    };
    const p = payload as { tasks?: TaskNode[] } & Partial<TaskNode>;
    if (Array.isArray(p.tasks)) p.tasks.forEach(walk);
    else walk(p);
    if (n > MAX_NODES) throw ApiException.validation(`Templates can hold at most ${MAX_NODES} tasks.`);
  }

  toView(t: TemplateDocument): TemplateView {
    return {
      id: t.id,
      kind: t.kind,
      name: t.name,
      description: t.description,
      payload: t.payload,
      useCount: t.useCount,
      createdAt: t.createdAt.toISOString(),
    };
  }
}
