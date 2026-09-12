import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Permission } from '@flowdesk/types';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto.js';
import type { RoleDocument } from './schemas/role.schema.js';
import { RolesService } from './roles.service.js';

interface RoleView {
  id: string;
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
  system: boolean;
  isDefault: boolean;
  isOwner: boolean;
}

function toView(role: RoleDocument): RoleView {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    permissions: role.permissions,
    system: role.system,
    isDefault: role.isDefault,
    isOwner: role.isOwner,
  };
}

@ApiTags('roles')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId/roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermissions('members.read')
  @ApiOperation({ summary: 'List roles in the workspace' })
  async list(@Param('workspaceId', ParseObjectIdPipe) workspaceId: string): Promise<RoleView[]> {
    return (await this.roles.list(workspaceId)).map(toView);
  }

  @Post()
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Create a custom role' })
  async create(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Body() dto: CreateRoleDto,
  ): Promise<RoleView> {
    return toView(await this.roles.create(workspaceId, dto));
  }

  @Patch(':roleId')
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Update a role (name, permissions, default flag)' })
  async update(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('roleId', ParseObjectIdPipe) roleId: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<RoleView> {
    return toView(await this.roles.update(workspaceId, roleId, dto));
  }

  @Delete(':roleId')
  @RequirePermissions('roles.manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a custom role' })
  async remove(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('roleId', ParseObjectIdPipe) roleId: string,
  ): Promise<{ message: string }> {
    await this.roles.remove(workspaceId, roleId);
    return { message: 'Role deleted.' };
  }
}
