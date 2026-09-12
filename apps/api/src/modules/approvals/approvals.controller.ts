import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsIn, IsInt, IsMongoId, IsOptional, IsString, Min, MaxLength, MinLength } from 'class-validator';
import { APPROVAL_DECISIONS, APPROVAL_STRATEGIES, type ApprovalDecision, type ApprovalStrategy } from '@flowdesk/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Membership, RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import type { WorkspaceMembershipContext } from '../../common/context/request-context.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { ApprovalsService, type ApprovalView } from './approvals.service.js';

class CreateApprovalDto {
  @IsIn(['task', 'deliverable', 'change_request', 'document', 'request']) subjectType!:
    | 'task'
    | 'deliverable'
    | 'change_request'
    | 'document'
    | 'request';
  @IsMongoId() subjectId!: string;
  @IsOptional() @IsMongoId() projectId?: string;
  @IsString() @MinLength(1) @MaxLength(240) title!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsIn(APPROVAL_STRATEGIES as unknown as string[]) strategy!: ApprovalStrategy;
  @IsOptional() @IsInt() @Min(1) requiredCount?: number;
  @IsArray() @ArrayNotEmpty() @IsMongoId({ each: true }) approverUserIds!: string[];
}
class DecideDto {
  @IsIn(APPROVAL_DECISIONS as unknown as string[]) decision!: ApprovalDecision;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}

@ApiTags('approvals')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId/approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  @RequirePermissions('approval.approve')
  @ApiOperation({ summary: 'Approvals awaiting my decision (or by subject with ?subjectType&subjectId)' })
  async list(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') u: string,
    @Query('subjectType') subjectType?: string,
    @Query('subjectId') subjectId?: string,
  ): Promise<ApprovalView[]> {
    const rows =
      subjectType && subjectId
        ? await this.approvals.listForSubject(w, subjectType, subjectId)
        : await this.approvals.listMinePending(w, u);
    return rows.map((a) => this.approvals.toView(a));
  }

  @Post()
  @RequirePermissions('approval.request')
  @ApiOperation({ summary: 'Request an approval (sequential / parallel-all / parallel-any / n-of-m)' })
  async create(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') u: string,
    @Body() dto: CreateApprovalDto,
  ): Promise<ApprovalView> {
    return this.approvals.toView(await this.approvals.create(w, u, dto));
  }

  @Post(':approvalId/steps/:stepId/decide')
  @RequirePermissions('approval.approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Record an approve / reject / request-changes decision (immutable)' })
  async decide(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('approvalId', ParseObjectIdPipe) approvalId: string,
    @Param('stepId', ParseObjectIdPipe) stepId: string,
    @CurrentUser('id') u: string,
    @Body() dto: DecideDto,
  ): Promise<ApprovalView> {
    return this.approvals.toView(await this.approvals.decide(w, approvalId, stepId, u, dto.decision, dto.comment));
  }

  @Post(':approvalId/cancel')
  @RequirePermissions('approval.request')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel a pending approval' })
  async cancel(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('approvalId', ParseObjectIdPipe) approvalId: string,
    @CurrentUser('id') u: string,
    @Membership() ctx: WorkspaceMembershipContext,
  ): Promise<ApprovalView> {
    return this.approvals.toView(await this.approvals.cancel(w, approvalId, u, ctx.isOwner || ctx.permissions.has('workspace.manage')));
  }
}
