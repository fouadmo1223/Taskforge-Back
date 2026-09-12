import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { ROLE_PRESETS, resolvePresetPermissions, type Permission } from '@flowdesk/types';
import { slugify } from '@flowdesk/utils';
import { ApiException } from '../../common/http/api-exception.js';
import { Role, type RoleDocument } from './schemas/role.schema.js';

@Injectable()
export class RolesService {
  constructor(@InjectModel(Role.name) private readonly model: Model<RoleDocument>) {}

  /** Insert the preset role set for a freshly created workspace. Returns the owner role. */
  async seedForWorkspace(workspaceId: Types.ObjectId, session: ClientSession): Promise<RoleDocument> {
    const docs = ROLE_PRESETS.map((preset) => ({
      workspaceId,
      key: preset.key,
      name: preset.name,
      description: preset.description,
      permissions: resolvePresetPermissions(preset),
      system: true,
      isOwner: preset.key === 'owner',
      isDefault: preset.key === 'member',
    }));
    const created = await this.model.insertMany(docs, { session });
    const owner = created.find((r) => r.isOwner);
    if (!owner) throw ApiException.unprocessable('Failed to seed workspace roles.');
    return owner as RoleDocument;
  }

  list(workspaceId: string): Promise<RoleDocument[]> {
    return this.model.find({ workspaceId: new Types.ObjectId(workspaceId) }).sort({ system: -1, name: 1 }).exec();
  }

  async getInWorkspace(workspaceId: string, roleId: string): Promise<RoleDocument> {
    const role = await this.model.findOne({ _id: roleId, workspaceId: new Types.ObjectId(workspaceId) }).exec();
    if (!role) throw ApiException.notFound('Role');
    return role;
  }

  async getDefaultRole(workspaceId: string | Types.ObjectId): Promise<RoleDocument> {
    const wid = typeof workspaceId === 'string' ? new Types.ObjectId(workspaceId) : workspaceId;
    const role =
      (await this.model.findOne({ workspaceId: wid, isDefault: true }).exec()) ??
      (await this.model.findOne({ workspaceId: wid, key: 'member' }).exec());
    if (!role) throw ApiException.unprocessable('Workspace has no default role configured.');
    return role;
  }

  async create(
    workspaceId: string,
    input: { name: string; description?: string; permissions: Permission[] },
  ): Promise<RoleDocument> {
    const key = `custom-${slugify(input.name) || 'role'}-${Date.now().toString(36)}`;
    return this.model.create({
      workspaceId: new Types.ObjectId(workspaceId),
      key,
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      permissions: dedupePermissions(input.permissions),
      system: false,
    });
  }

  async update(
    workspaceId: string,
    roleId: string,
    patch: Partial<{ name: string; description: string; permissions: Permission[]; isDefault: boolean }>,
  ): Promise<RoleDocument> {
    const role = await this.getInWorkspace(workspaceId, roleId);
    if (role.isOwner) throw ApiException.forbidden('The Owner role cannot be modified.');

    if (patch.name !== undefined) role.name = patch.name.trim();
    if (patch.description !== undefined) role.description = patch.description.trim();
    if (patch.permissions !== undefined) {
      if (role.system && role.key === 'admin') {
        throw ApiException.forbidden('The Admin role permission set is fixed.');
      }
      role.permissions = dedupePermissions(patch.permissions);
    }
    if (patch.isDefault === true) {
      await this.model.updateMany({ workspaceId: role.workspaceId }, { $set: { isDefault: false } });
      role.isDefault = true;
    }
    await role.save();
    return role;
  }

  async remove(workspaceId: string, roleId: string): Promise<void> {
    const role = await this.getInWorkspace(workspaceId, roleId);
    if (role.system) throw ApiException.forbidden('System roles cannot be deleted.');
    await this.model.deleteOne({ _id: role._id }).exec();
  }
}

function dedupePermissions(permissions: Permission[]): Permission[] {
  return [...new Set(permissions)];
}
