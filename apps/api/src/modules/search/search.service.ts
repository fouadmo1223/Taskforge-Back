import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Task, type TaskDocument } from '../tasks/schemas/task.schema.js';
import { Project, type ProjectDocument } from '../projects/schemas/project.schema.js';
import { Comment, type CommentDocument } from '../comments/schemas/comment.schema.js';

export type SearchType = 'task' | 'project' | 'comment';

export interface SearchHit {
  type: SearchType;
  id: string;
  title: string;
  subtitle: string | null;
  projectId: string | null;
  taskId: string | null;
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class SearchService {
  constructor(
    @InjectModel(Task.name) private readonly tasks: Model<TaskDocument>,
    @InjectModel(Project.name) private readonly projects: Model<ProjectDocument>,
    @InjectModel(Comment.name) private readonly comments: Model<CommentDocument>,
  ) {}

  async search(
    workspaceId: string,
    query: string,
    types: SearchType[],
    perType = 8,
  ): Promise<SearchHit[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    const wid = new Types.ObjectId(workspaceId);
    const rx = new RegExp(escapeRegex(q), 'i');
    const keyMatch = /^[a-z]{2,6}-\d{1,7}$/i.test(q);
    const want = (t: SearchType): boolean => types.length === 0 || types.includes(t);

    const jobs: Array<Promise<SearchHit[]>> = [];

    if (want('task')) {
      const filter: Record<string, unknown> = {
        workspaceId: wid,
        deletedAt: null,
        ...(keyMatch ? { key: q.toUpperCase() } : { $or: [{ title: rx }, { key: rx }] }),
      };
      jobs.push(
        this.tasks
          .find(filter)
          .select('key title projectId')
          .limit(perType)
          .lean()
          .then((rows) =>
            rows.map<SearchHit>((r) => ({
              type: 'task',
              id: r._id.toString(),
              title: r.title,
              subtitle: r.key,
              projectId: r.projectId.toString(),
              taskId: r._id.toString(),
            })),
          ),
      );
    }

    if (want('project')) {
      jobs.push(
        this.projects
          .find({ workspaceId: wid, deletedAt: null, $or: [{ name: rx }, { key: rx }] })
          .select('name key')
          .limit(perType)
          .lean()
          .then((rows) =>
            rows.map<SearchHit>((r) => ({
              type: 'project',
              id: r._id.toString(),
              title: r.name,
              subtitle: r.key,
              projectId: r._id.toString(),
              taskId: null,
            })),
          ),
      );
    }

    if (want('comment')) {
      jobs.push(
        this.comments
          .find({ workspaceId: wid, deletedAt: null, bodyText: rx })
          .select('bodyText taskId projectId')
          .limit(perType)
          .lean()
          .then((rows) =>
            rows.map<SearchHit>((r) => ({
              type: 'comment',
              id: r._id.toString(),
              title: r.bodyText.slice(0, 120),
              subtitle: 'Comment',
              projectId: r.projectId.toString(),
              taskId: r.taskId.toString(),
            })),
          ),
      );
    }

    const results = await Promise.all(jobs);
    return results.flat();
  }
}
