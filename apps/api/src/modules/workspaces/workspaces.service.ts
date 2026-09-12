import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import type { Locale } from '@flowdesk/types';
import { slugify } from '@flowdesk/utils';
import { ApiException } from '../../common/http/api-exception.js';
import { MembershipsService } from '../memberships/memberships.service.js';
import { RolesService } from '../roles/roles.service.js';
import { Workspace, type WorkspaceDocument } from './schemas/workspace.schema.js';

export interface WorkspaceView {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  logo: WorkspaceDocument['logo'];
  settings: {
    primaryColor: string | null;
    secondaryColor: string | null;
    defaultLocale: Locale;
    timezone: string;
    allowConcurrentTimers: boolean;
    clientsSeeFinance: boolean;
  };
  createdAt: string;
}

export interface CreateWorkspaceInput {
  name: string;
  slug?: string;
  defaultLocale?: Locale;
}

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectModel(Workspace.name) private readonly model: Model<WorkspaceDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly roles: RolesService,
    private readonly memberships: MembershipsService,
  ) {}

  async create(userId: string, input: CreateWorkspaceInput): Promise<WorkspaceDocument> {
    const slug = await this.uniqueSlug(input.slug ?? input.name);
    const session = await this.connection.startSession();
    try {
      let workspace!: WorkspaceDocument;
      await session.withTransaction(async () => {
        const [ws] = await this.model.create(
          [
            {
              name: input.name.trim(),
              slug,
              ownerUserId: new Types.ObjectId(userId),
              settings: { defaultLocale: input.defaultLocale ?? 'en' },
            },
          ],
          { session },
        );
        workspace = ws!;
        const ownerRole = await this.roles.seedForWorkspace(workspace._id as Types.ObjectId, session);
        await this.memberships.createOwnerMembership(
          workspace._id as Types.ObjectId,
          userId,
          ownerRole._id as Types.ObjectId,
          session,
        );
      });
      return workspace;
    } finally {
      await session.endSession();
    }
  }

  async getById(workspaceId: string): Promise<WorkspaceDocument> {
    const ws = await this.model.findOne({ _id: workspaceId, deletedAt: null }).exec();
    if (!ws) throw ApiException.notFound('Workspace');
    return ws;
  }

  listForUser(workspaceIds: string[]): Promise<WorkspaceDocument[]> {
    return this.model
      .find({ _id: { $in: workspaceIds.map((id) => new Types.ObjectId(id)) }, deletedAt: null })
      .sort({ name: 1 })
      .exec();
  }

  async update(
    workspaceId: string,
    patch: Partial<{
      name: string;
      settings: Partial<{
        primaryColor: string | null;
        secondaryColor: string | null;
        defaultLocale: Locale;
        timezone: string;
        allowConcurrentTimers: boolean;
        clientsSeeFinance: boolean;
      }>;
    }>,
  ): Promise<WorkspaceDocument> {
    const ws = await this.getById(workspaceId);
    if (patch.name !== undefined) ws.name = patch.name.trim();
    if (patch.settings) {
      ws.settings = { ...ws.settings, ...patch.settings } as WorkspaceDocument['settings'];
    }
    await ws.save();
    return ws;
  }

  async softDelete(workspaceId: string, actorUserId: string): Promise<void> {
    const ws = await this.getById(workspaceId);
    if (ws.ownerUserId.toString() !== actorUserId) {
      throw ApiException.forbidden('Only the workspace owner can delete it.');
    }
    ws.deletedAt = new Date();
    ws.deletedBy = new Types.ObjectId(actorUserId);
    await ws.save();
  }

  serialize(ws: WorkspaceDocument): WorkspaceView {
    return {
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
      ownerUserId: ws.ownerUserId.toString(),
      logo: ws.logo,
      settings: {
        primaryColor: ws.settings.primaryColor,
        secondaryColor: ws.settings.secondaryColor,
        defaultLocale: ws.settings.defaultLocale,
        timezone: ws.settings.timezone,
        allowConcurrentTimers: ws.settings.allowConcurrentTimers,
        clientsSeeFinance: ws.settings.clientsSeeFinance,
      },
      createdAt: ws.createdAt.toISOString(),
    };
  }

  private async uniqueSlug(source: string): Promise<string> {
    const base = slugify(source) || 'workspace';
    for (let i = 0; i < 50; i += 1) {
      const candidate = i === 0 ? base : `${base}-${i + 1}`;
      const taken = await this.model.exists({ slug: candidate });
      if (!taken) return candidate;
    }
    return `${base}-${Date.now().toString(36)}`;
  }
}
