import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Membership } from '../../common/decorators/workspace.decorator.js';
import type { WorkspaceMembershipContext } from '../../common/context/request-context.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { PortalGuard } from './portal.guard.js';
import {
  PortalService,
  type PortalOverview,
  type PortalProjectDetail,
} from './portal.service.js';
import type { DeliverableView } from '../deliverables/deliverables.service.js';
import type { ApprovalView } from '../approvals/approvals.service.js';
import type { RequestView } from '../intake/requests.service.js';

class PortalRequestDto {
  @IsString() @MinLength(1) @MaxLength(240) title!: string;
  @IsOptional() @IsString() @MaxLength(8000) description?: string;
  @IsOptional() @IsMongoId() projectId?: string;
}

@ApiTags('portal')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard, PortalGuard)
@Controller('workspaces/:workspaceId/portal')
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Client portal landing: projects, pending approvals, open requests' })
  async overview(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Membership() ctx: WorkspaceMembershipContext,
  ): Promise<PortalOverview> {
    return this.portal.overview(w, ctx.clientId!, ctx.userId);
  }

  @Get('projects/:projectId')
  @ApiOperation({ summary: 'Client-visible detail for one project' })
  async projectDetail(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('projectId', ParseObjectIdPipe) projectId: string,
    @Membership() ctx: WorkspaceMembershipContext,
  ): Promise<PortalProjectDetail> {
    return this.portal.projectDetail(w, ctx.clientId!, projectId);
  }

  @Get('deliverables')
  @ApiOperation({ summary: 'All client-visible deliverables across the client’s projects' })
  async deliverables(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Membership() ctx: WorkspaceMembershipContext,
  ): Promise<DeliverableView[]> {
    return this.portal.deliverablesForClient(w, ctx.clientId!);
  }

  @Get('approvals')
  @ApiOperation({ summary: 'Approvals awaiting this client’s decision' })
  async approvals(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Membership() ctx: WorkspaceMembershipContext,
  ): Promise<ApprovalView[]> {
    return this.portal.approvalsForClient(w, ctx.userId);
  }

  @Get('requests')
  @ApiOperation({ summary: 'Requests raised by this client' })
  async requests(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Membership() ctx: WorkspaceMembershipContext,
  ): Promise<RequestView[]> {
    return this.portal.requestsForClient(w, ctx.clientId!);
  }

  @Post('requests')
  @ApiOperation({ summary: 'Raise a new request from the portal' })
  async createRequest(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') userId: string,
    @Membership() ctx: WorkspaceMembershipContext,
    @Body() dto: PortalRequestDto,
  ): Promise<RequestView> {
    return this.portal.createRequest(w, ctx.clientId!, userId, dto);
  }
}
