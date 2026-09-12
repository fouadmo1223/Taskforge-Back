import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  DECISION_STATUSES,
  ISSUE_STATUSES,
  RISK_SCALE,
  RISK_STATUSES,
  SEVERITIES,
  type DecisionStatus,
  type IssueStatus,
  type RiskScale,
  type RiskStatus,
  type Severity,
} from '@flowdesk/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { GovernanceService, type DecisionView, type IssueView, type RiskView } from './governance.service.js';

class CreateRiskDto {
  @IsString() @MinLength(1) @MaxLength(240) title!: string;
  @IsOptional() @IsString() @MaxLength(8000) description?: string;
  @IsOptional() @IsIn(RISK_SCALE as unknown as string[]) probability?: RiskScale;
  @IsOptional() @IsIn(RISK_SCALE as unknown as string[]) impact?: RiskScale;
  @IsOptional() @IsMongoId() ownerUserId?: string;
  @IsOptional() @IsString() @MaxLength(4000) mitigation?: string;
  @IsOptional() @IsString() @MaxLength(4000) contingency?: string;
  @IsOptional() @IsString() reviewDate?: string;
}
class UpdateRiskDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(240) title?: string;
  @IsOptional() @IsString() @MaxLength(8000) description?: string;
  @IsOptional() @IsIn(RISK_SCALE as unknown as string[]) probability?: RiskScale;
  @IsOptional() @IsIn(RISK_SCALE as unknown as string[]) impact?: RiskScale;
  @IsOptional() @IsIn(RISK_STATUSES as unknown as string[]) status?: RiskStatus;
  @IsOptional() @IsMongoId() ownerUserId?: string;
  @IsOptional() @IsString() @MaxLength(4000) mitigation?: string;
  @IsOptional() @IsString() @MaxLength(4000) contingency?: string;
  @IsOptional() @IsString() reviewDate?: string;
}

class CreateIssueDto {
  @IsString() @MinLength(1) @MaxLength(240) title!: string;
  @IsOptional() @IsString() @MaxLength(8000) description?: string;
  @IsOptional() @IsIn(SEVERITIES as unknown as string[]) severity?: Severity;
  @IsOptional() @IsMongoId() ownerUserId?: string;
  @IsOptional() @IsMongoId() linkedRiskId?: string;
  @IsOptional() @IsMongoId() linkedTaskId?: string;
  @IsOptional() @IsString() dueDate?: string;
}
class UpdateIssueDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(240) title?: string;
  @IsOptional() @IsString() @MaxLength(8000) description?: string;
  @IsOptional() @IsIn(SEVERITIES as unknown as string[]) severity?: Severity;
  @IsOptional() @IsIn(ISSUE_STATUSES as unknown as string[]) status?: IssueStatus;
  @IsOptional() @IsMongoId() ownerUserId?: string;
  @IsOptional() @IsMongoId() linkedRiskId?: string;
  @IsOptional() @IsMongoId() linkedTaskId?: string;
  @IsOptional() @IsString() dueDate?: string;
}

class CreateDecisionDto {
  @IsString() @MinLength(1) @MaxLength(240) title!: string;
  @IsOptional() @IsString() @MaxLength(8000) context?: string;
  @IsOptional() @IsString() @MaxLength(8000) decision?: string;
  @IsOptional() @IsMongoId() supersedesId?: string;
}
class UpdateDecisionDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(240) title?: string;
  @IsOptional() @IsString() @MaxLength(8000) context?: string;
  @IsOptional() @IsString() @MaxLength(8000) decision?: string;
  @IsOptional() @IsIn(DECISION_STATUSES as unknown as string[]) status?: DecisionStatus;
}

@ApiTags('governance')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId')
export class GovernanceController {
  constructor(private readonly gov: GovernanceService) {}

  @Get('projects/:projectId/raid')
  @RequirePermissions('project.read')
  @ApiOperation({ summary: 'Combined risks, issues & decisions log for a project' })
  raid(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('projectId', ParseObjectIdPipe) projectId: string,
  ): Promise<{ risks: RiskView[]; issues: IssueView[]; decisions: DecisionView[] }> {
    return this.gov.raid(w, projectId);
  }

  // ── risks ──────────────────────────────────────────────────────────────

  @Post('projects/:projectId/risks')
  @RequirePermissions('risk.manage')
  @ApiOperation({ summary: 'Add a risk' })
  async createRisk(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('projectId', ParseObjectIdPipe) projectId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateRiskDto,
  ): Promise<RiskView> {
    return this.gov.riskView(await this.gov.createRisk(w, projectId, userId, dto));
  }

  @Patch('risks/:riskId')
  @RequirePermissions('risk.manage')
  @ApiOperation({ summary: 'Update a risk' })
  async updateRisk(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('riskId', ParseObjectIdPipe) riskId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateRiskDto,
  ): Promise<RiskView> {
    return this.gov.riskView(await this.gov.updateRisk(w, riskId, userId, dto));
  }

  @Delete('risks/:riskId')
  @RequirePermissions('risk.manage')
  @HttpCode(200)
  async deleteRisk(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('riskId', ParseObjectIdPipe) riskId: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ message: string }> {
    await this.gov.deleteRisk(w, riskId, userId);
    return { message: 'Risk deleted.' };
  }

  // ── issues ─────────────────────────────────────────────────────────────

  @Post('projects/:projectId/issues')
  @RequirePermissions('issue.manage')
  @ApiOperation({ summary: 'Add an issue' })
  async createIssue(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('projectId', ParseObjectIdPipe) projectId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateIssueDto,
  ): Promise<IssueView> {
    return this.gov.issueView(await this.gov.createIssue(w, projectId, userId, dto));
  }

  @Patch('issues/:issueId')
  @RequirePermissions('issue.manage')
  async updateIssue(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('issueId', ParseObjectIdPipe) issueId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateIssueDto,
  ): Promise<IssueView> {
    return this.gov.issueView(await this.gov.updateIssue(w, issueId, userId, dto));
  }

  @Delete('issues/:issueId')
  @RequirePermissions('issue.manage')
  @HttpCode(200)
  async deleteIssue(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('issueId', ParseObjectIdPipe) issueId: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ message: string }> {
    await this.gov.deleteIssue(w, issueId, userId);
    return { message: 'Issue deleted.' };
  }

  // ── decisions ──────────────────────────────────────────────────────────

  @Post('projects/:projectId/decisions')
  @RequirePermissions('decision.manage')
  @ApiOperation({ summary: 'Log a decision' })
  async createDecision(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('projectId', ParseObjectIdPipe) projectId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateDecisionDto,
  ): Promise<DecisionView> {
    return this.gov.decisionView(await this.gov.createDecision(w, projectId, userId, dto));
  }

  @Patch('decisions/:decisionId')
  @RequirePermissions('decision.manage')
  async updateDecision(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('decisionId', ParseObjectIdPipe) decisionId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateDecisionDto,
  ): Promise<DecisionView> {
    return this.gov.decisionView(await this.gov.updateDecision(w, decisionId, userId, dto));
  }

  @Delete('decisions/:decisionId')
  @RequirePermissions('decision.manage')
  @HttpCode(200)
  async deleteDecision(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('decisionId', ParseObjectIdPipe) decisionId: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ message: string }> {
    await this.gov.deleteDecision(w, decisionId, userId);
    return { message: 'Decision deleted.' };
  }
}
