import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { PROJECT_VISIBILITY, type Locale, type ProjectStatus, type ProjectVisibility } from '@flowdesk/types';
import { initialRanks, rankAfter } from '@flowdesk/utils';
import { ApiException } from '../../common/http/api-exception.js';
import { Board, type BoardDocument } from '../boards/schemas/board.schema.js';
import { BoardColumn, type BoardColumnDocument } from '../columns/schemas/board-column.schema.js';
import { Workspace, type WorkspaceDocument } from '../workspaces/schemas/workspace.schema.js';
import { TeamsService } from '../teams/teams.service.js';
import { Project, type ProjectDocument } from './schemas/project.schema.js';

/** Enough of the caller's membership to decide project visibility. */
export interface ProjectViewer {
  userId: string;
  isOwner: boolean;
  /** holds `project.create` — treated as a project manager who sees everything */
  canManageProjects: boolean;
}

type ColumnSeed = { name: string; statusCategory: BoardColumnDocument['statusCategory'] };

const COLUMN_SETS: Record<Locale, ColumnSeed[]> = {
  en: [
    { name: 'Backlog', statusCategory: 'backlog' },
    { name: 'To Do', statusCategory: 'todo' },
    { name: 'In Progress', statusCategory: 'in_progress' },
    { name: 'In Review', statusCategory: 'in_review' },
    { name: 'Done', statusCategory: 'done' },
  ],
  ar: [
    { name: 'قيد الانتظار', statusCategory: 'backlog' },
    { name: 'للتنفيذ', statusCategory: 'todo' },
    { name: 'قيد التنفيذ', statusCategory: 'in_progress' },
    { name: 'قيد المراجعة', statusCategory: 'in_review' },
    { name: 'مكتمل', statusCategory: 'done' },
  ],
};
const BOARD_NAME: Record<Locale, string> = { en: 'Main board', ar: 'اللوحة الرئيسية' };

export interface ProjectView {
  id: string;
  key: string;
  name: string;
  description: string;
  status: ProjectStatus;
  color: string;
  cover: ProjectDocument['cover'];
  leadUserId: string | null;
  memberUserIds: string[];
  visibility: ProjectVisibility;
  teamIds: string[];
  startDate: string | null;
  endDate: string | null;
  archived: boolean;
  defaultBoardId: string | null;
  createdAt: string;
}

@Injectable()
export class ProjectsService {
  constructor(
    @InjectModel(Project.name) private readonly projects: Model<ProjectDocument>,
    @InjectModel(Board.name) private readonly boards: Model<BoardDocument>,
    @InjectModel(BoardColumn.name) private readonly columns: Model<BoardColumnDocument>,
    @InjectModel(Workspace.name) private readonly workspaces: Model<WorkspaceDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly teams: TeamsService,
  ) {}

  /**
   * Mongo filter fragment restricting a list to what `viewer` may see. Returns
   * `null` for unrestricted (owner / project manager).
   */
  async visibilityFilter(workspaceId: string, viewer: ProjectViewer): Promise<Record<string, unknown> | null> {
    if (viewer.isOwner || viewer.canManageProjects) return null;
    const teamIds = (await this.teams.teamIdsForUser(workspaceId, viewer.userId)).map((id) => new Types.ObjectId(id));
    const uid = new Types.ObjectId(viewer.userId);
    return {
      $or: [
        { visibility: 'workspace' },
        { visibility: { $exists: false } }, // projects created before visibility existed
        { visibility: 'team', teamIds: { $in: teamIds } },
        // memberUserIds is an *additional* grant on top of whatever the visibility
        // mode already allows — e.g. a team-visibility project can still name a few
        // extra people who aren't on any of the listed teams — not just the sole
        // gate for 'private' mode.
        { memberUserIds: uid },
        { createdByUserId: uid },
        { leadUserId: uid },
      ],
    };
  }

  canAccess(
    project: Pick<ProjectDocument, 'visibility' | 'teamIds' | 'memberUserIds' | 'createdByUserId' | 'leadUserId'>,
    viewer: ProjectViewer,
    viewerTeamIds: string[],
  ): boolean {
    if (viewer.isOwner || viewer.canManageProjects) return true;
    if (project.visibility === 'workspace') return true;
    const uid = viewer.userId;
    if (project.createdByUserId?.toString() === uid || project.leadUserId?.toString() === uid) return true;
    if (project.memberUserIds.some((m) => m.toString() === uid)) return true;
    if (project.visibility === 'team') {
      const allowed = new Set(project.teamIds.map((tid) => tid.toString()));
      return viewerTeamIds.some((tid) => allowed.has(tid));
    }
    return false;
  }

  // ── resolver for guards / room authorization ─────────────────────────────
  async workspaceIdOf(projectId: string): Promise<string | null> {
    if (!Types.ObjectId.isValid(projectId)) return null;
    const doc = await this.projects.findById(projectId).select('workspaceId deletedAt').lean();
    if (!doc || doc.deletedAt) return null;
    return doc.workspaceId.toString();
  }

  // ── queries ─────────────────────────────────────────────────────────────
  async list(
    workspaceId: string,
    opts: { includeArchived?: boolean; viewer?: ProjectViewer } = {},
  ): Promise<ProjectDocument[]> {
    const filter: Record<string, unknown> = { workspaceId: new Types.ObjectId(workspaceId), deletedAt: null };
    if (!opts.includeArchived) filter.archivedAt = null;
    if (opts.viewer) {
      const vis = await this.visibilityFilter(workspaceId, opts.viewer);
      if (vis) Object.assign(filter, vis);
    }
    return this.projects.find(filter).sort({ createdAt: -1 }).exec();
  }

  async getOrThrow(workspaceId: string, projectId: string, viewer?: ProjectViewer): Promise<ProjectDocument> {
    const project = await this.projects.findOne({ _id: projectId, workspaceId: new Types.ObjectId(workspaceId), deletedAt: null }).exec();
    if (!project) throw ApiException.notFound('Project');
    if (viewer && !(viewer.isOwner || viewer.canManageProjects)) {
      const teamIds = await this.teams.teamIdsForUser(workspaceId, viewer.userId);
      if (!this.canAccess(project, viewer, teamIds)) throw ApiException.notFound('Project');
    }
    return project;
  }

  async setAccess(
    workspaceId: string,
    projectId: string,
    patch: { visibility?: ProjectVisibility; teamIds?: string[]; memberUserIds?: string[] },
  ): Promise<ProjectDocument> {
    const project = await this.getOrThrow(workspaceId, projectId);
    if (patch.visibility !== undefined) {
      if (!PROJECT_VISIBILITY.includes(patch.visibility)) throw ApiException.validation('Invalid visibility.');
      project.visibility = patch.visibility;
    }
    if (patch.teamIds !== undefined) project.teamIds = [...new Set(patch.teamIds)].map((id) => new Types.ObjectId(id));
    if (patch.memberUserIds !== undefined) {
      project.memberUserIds = [...new Set(patch.memberUserIds)].map((id) => new Types.ObjectId(id));
    }
    await project.save();
    return project;
  }

  async defaultBoardId(projectId: string | Types.ObjectId): Promise<string | null> {
    const board =
      (await this.boards.findOne({ projectId, isDefault: true }).select('_id').lean()) ??
      (await this.boards.findOne({ projectId }).sort({ rank: 1 }).select('_id').lean());
    return board?._id.toString() ?? null;
  }

  // ── mutations ───────────────────────────────────────────────────────────
  async create(
    workspaceId: string,
    userId: string,
    input: {
      name: string;
      key?: string;
      description?: string;
      color?: string;
      leadUserId?: string | null;
      visibility?: ProjectVisibility;
      teamIds?: string[];
    },
  ): Promise<ProjectDocument> {
    const key = await this.allocateKey(workspaceId, input.key ?? input.name);
    const ws = await this.workspaces.findById(workspaceId).select('settings.defaultLocale').lean();
    const locale: Locale = ws?.settings?.defaultLocale === 'ar' ? 'ar' : 'en';
    const columnSet = COLUMN_SETS[locale];
    const session = await this.connection.startSession();
    try {
      let project!: ProjectDocument;
      await session.withTransaction(async () => {
        const [p] = await this.projects.create(
          [
            {
              workspaceId: new Types.ObjectId(workspaceId),
              key,
              name: input.name.trim(),
              description: input.description?.trim() ?? '',
              color: input.color ?? '#4f46e5',
              visibility: input.visibility ?? 'workspace',
              teamIds: (input.teamIds ?? []).map((id) => new Types.ObjectId(id)),
              leadUserId: input.leadUserId ? new Types.ObjectId(input.leadUserId) : null,
              memberUserIds: input.leadUserId
                ? [new Types.ObjectId(input.leadUserId), new Types.ObjectId(userId)]
                : [new Types.ObjectId(userId)],
              createdByUserId: new Types.ObjectId(userId),
            },
          ],
          { session },
        );
        project = p!;

        const [board] = await this.boards.create(
          [
            {
              workspaceId: project.workspaceId,
              projectId: project._id,
              name: BOARD_NAME[locale],
              isDefault: true,
              rank: rankAfter(null),
            },
          ],
          { session },
        );

        const ranks = initialRanks(columnSet.length);
        await this.columns.create(
          columnSet.map((c, i) => ({
            workspaceId: project.workspaceId,
            boardId: board!._id,
            projectId: project._id,
            name: c.name,
            statusCategory: c.statusCategory,
            rank: ranks[i]!,
          })),
          { session, ordered: true },
        );
      });
      return project;
    } finally {
      await session.endSession();
    }
  }

  async update(
    workspaceId: string,
    projectId: string,
    patch: Partial<{
      name: string;
      description: string;
      status: ProjectStatus;
      color: string;
      leadUserId: string | null;
      memberUserIds: string[];
      startDate: string | null;
      endDate: string | null;
    }>,
  ): Promise<ProjectDocument> {
    const project = await this.getOrThrow(workspaceId, projectId);
    if (patch.name !== undefined) project.name = patch.name.trim();
    if (patch.description !== undefined) project.description = patch.description.trim();
    if (patch.status !== undefined) project.status = patch.status;
    if (patch.color !== undefined) project.color = patch.color;
    if (patch.leadUserId !== undefined) project.leadUserId = patch.leadUserId ? new Types.ObjectId(patch.leadUserId) : null;
    if (patch.memberUserIds !== undefined) project.memberUserIds = patch.memberUserIds.map((id) => new Types.ObjectId(id));
    if (patch.startDate !== undefined) project.startDate = patch.startDate ? new Date(patch.startDate) : null;
    if (patch.endDate !== undefined) project.endDate = patch.endDate ? new Date(patch.endDate) : null;
    await project.save();
    return project;
  }

  async setArchived(workspaceId: string, projectId: string, archived: boolean): Promise<ProjectDocument> {
    const project = await this.getOrThrow(workspaceId, projectId);
    project.archivedAt = archived ? new Date() : null;
    if (archived) project.status = 'archived';
    else if (project.status === 'archived') project.status = 'active';
    await project.save();
    return project;
  }

  async softDelete(workspaceId: string, projectId: string, userId: string): Promise<void> {
    const project = await this.getOrThrow(workspaceId, projectId);
    project.deletedAt = new Date();
    project.deletedBy = new Types.ObjectId(userId);
    await project.save();
  }

  /** Atomically bump and return the next task number for a project. */
  async nextTaskNumber(projectId: Types.ObjectId, session?: import('mongoose').ClientSession): Promise<{ key: string; n: number }> {
    const project = await this.projects
      .findByIdAndUpdate(projectId, { $inc: { taskCounter: 1 } }, { new: true, session })
      .select('key taskCounter')
      .exec();
    if (!project) throw ApiException.notFound('Project');
    return { key: `${project.key}-${project.taskCounter}`, n: project.taskCounter };
  }

  async serialize(project: ProjectDocument): Promise<ProjectView> {
    return {
      id: project.id,
      key: project.key,
      name: project.name,
      description: project.description,
      status: project.status,
      color: project.color,
      cover: project.cover,
      leadUserId: project.leadUserId?.toString() ?? null,
      memberUserIds: project.memberUserIds.map((id) => id.toString()),
      visibility: project.visibility,
      teamIds: project.teamIds.map((id) => id.toString()),
      startDate: project.startDate?.toISOString() ?? null,
      endDate: project.endDate?.toISOString() ?? null,
      archived: project.archivedAt !== null,
      defaultBoardId: await this.defaultBoardId(project._id as Types.ObjectId),
      createdAt: project.createdAt.toISOString(),
    };
  }

  private async allocateKey(workspaceId: string, source: string): Promise<string> {
    const base =
      source
        .normalize('NFKD')
        .replace(/[^a-zA-Z]/g, '')
        .toUpperCase()
        .slice(0, 4) || 'PRJ';
    for (let i = 0; i < 100; i += 1) {
      const candidate = i === 0 ? base : `${base}${i + 1}`;
      const taken = await this.projects.exists({ workspaceId: new Types.ObjectId(workspaceId), key: candidate });
      if (!taken) return candidate.length >= 2 ? candidate : `${candidate}X`;
    }
    return `${base}${Date.now().toString(36).slice(-3).toUpperCase()}`;
  }
}
