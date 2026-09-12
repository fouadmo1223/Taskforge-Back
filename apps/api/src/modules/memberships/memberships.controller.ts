import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AppConfig } from '../../config/configuration.js';
import type { CloudinaryAsset } from '@flowdesk/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Membership, RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import type { RequestUser, WorkspaceMembershipContext } from '../../common/context/request-context.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ApiException } from '../../common/http/api-exception.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { UsersService } from '../users/users.service.js';
import {
  AcceptInviteDto,
  ChangeMemberRoleDto,
  InviteMemberDto,
  SetMemberStatusDto,
} from './dto/membership.dto.js';
import { MembershipsService } from './memberships.service.js';
import type { WorkspaceMembershipDocument } from './schemas/workspace-membership.schema.js';

interface MemberView {
  id: string;
  status: string;
  isClient: boolean;
  user: { id: string; name: string; email: string; avatar: CloudinaryAsset | null } | null;
  invitedEmail: string | null;
  role: { id: string; key: string; name: string } | null;
  joinedAt: string | null;
  createdAt: string;
}

function toView(m: WorkspaceMembershipDocument): MemberView {
  const user = m.userId && typeof m.userId === 'object' && 'name' in m.userId
    ? (m.userId as unknown as { _id: unknown; name: string; email: string; avatar: CloudinaryAsset | null })
    : null;
  const role = m.roleId && typeof m.roleId === 'object' && 'name' in m.roleId ? (m.roleId as unknown as { _id: unknown; key: string; name: string }) : null;
  return {
    id: m.id,
    status: m.status,
    isClient: m.isClient,
    user: user ? { id: String(user._id), name: user.name, email: user.email, avatar: user.avatar ?? null } : null,
    invitedEmail: m.invitedEmail,
    role: role ? { id: String(role._id), key: role.key, name: role.name } : null,
    joinedAt: m.joinedAt ? m.joinedAt.toISOString() : null,
    createdAt: m.createdAt.toISOString(),
  };
}

@ApiTags('members')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId/members')
export class MembershipsController {
  constructor(
    private readonly memberships: MembershipsService,
    private readonly users: UsersService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Get()
  @RequirePermissions('members.read')
  @ApiOperation({ summary: 'List members and pending invites' })
  async list(@Param('workspaceId', ParseObjectIdPipe) workspaceId: string): Promise<MemberView[]> {
    return (await this.memberships.listMembers(workspaceId)).map(toView);
  }

  @Post('invites')
  @RequirePermissions('members.invite')
  @HttpCode(202)
  @ApiOperation({ summary: 'Invite a person to the workspace by email' })
  async invite(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Body() dto: InviteMemberDto,
    @CurrentUser() actor: RequestUser,
  ): Promise<MemberView> {
    const inviter = await this.users.getByIdOrThrow(actor.id);
    const base = `${this.webOrigin()}/invites/accept`;
    const doc = await this.memberships.invite(workspaceId, dto, { id: inviter.id, name: inviter.name }, base);
    return toView(doc);
  }

  @Patch(':membershipId/role')
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: "Change a member's role" })
  async changeRole(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('membershipId', ParseObjectIdPipe) membershipId: string,
    @Body() dto: ChangeMemberRoleDto,
  ): Promise<MemberView> {
    return toView(await this.memberships.changeRole(workspaceId, membershipId, dto.roleId));
  }

  @Patch(':membershipId/status')
  @RequirePermissions('members.invite')
  @ApiOperation({ summary: 'Suspend or reactivate a member' })
  async setStatus(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('membershipId', ParseObjectIdPipe) membershipId: string,
    @Body() dto: SetMemberStatusDto,
  ): Promise<MemberView> {
    return toView(await this.memberships.setStatus(workspaceId, membershipId, dto.status));
  }

  @Delete(':membershipId')
  @RequirePermissions('members.remove')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove a member from the workspace' })
  async remove(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('membershipId', ParseObjectIdPipe) membershipId: string,
    @Membership() ctx: WorkspaceMembershipContext,
  ): Promise<{ message: string }> {
    if (ctx.membershipId === membershipId) {
      throw ApiException.validation('Use "leave workspace" to remove yourself.');
    }
    await this.memberships.removeMember(workspaceId, membershipId);
    return { message: 'Member removed.' };
  }

  private webOrigin(): string {
    return this.config.get('http.webOrigin', { infer: true })[0] ?? 'http://localhost:5173';
  }
}
