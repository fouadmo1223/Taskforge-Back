import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsIn, IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { COMMENT_VISIBILITY, type CommentVisibility } from '@flowdesk/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Membership, RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import type { WorkspaceMembershipContext } from '../../common/context/request-context.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ApiException } from '../../common/http/api-exception.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { ActivityService } from '../activity/activity.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { CommentsService, type CommentView } from './comments.service.js';

class CreateCommentDto {
  @IsString() @MinLength(1) @MaxLength(50_000) bodyHtml!: string;
  @IsOptional() @IsIn(COMMENT_VISIBILITY as unknown as string[]) visibility?: CommentVisibility;
  @IsOptional() @IsArray() @IsMongoId({ each: true }) mentionUserIds?: string[];
}
class UpdateCommentDto {
  @IsString() @MinLength(1) @MaxLength(50_000) bodyHtml!: string;
}

@ApiTags('comments')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId/tasks/:taskId/comments')
export class CommentsController {
  constructor(
    private readonly comments: CommentsService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  @Get()
  @RequirePermissions('comment.read')
  @ApiOperation({ summary: 'List comments on a task (internal ones hidden from clients)' })
  async list(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('taskId', ParseObjectIdPipe) taskId: string,
    @Membership() ctx: WorkspaceMembershipContext,
  ): Promise<CommentView[]> {
    const rows = await this.comments.listForTask(workspaceId, taskId, { internalAllowed: !ctx.isClient });
    return rows.map((c) => this.comments.toView(c));
  }

  @Post()
  @RequirePermissions('comment.create')
  @ApiOperation({ summary: 'Add a comment (external/client-visible needs comment.external)' })
  async create(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('taskId', ParseObjectIdPipe) taskId: string,
    @CurrentUser('id') userId: string,
    @Membership() ctx: WorkspaceMembershipContext,
    @Body() dto: CreateCommentDto,
  ): Promise<CommentView> {
    const visibility: CommentVisibility = ctx.isClient ? 'external' : (dto.visibility ?? 'internal');
    if (visibility === 'external' && !ctx.isClient && !ctx.permissions.has('comment.external') && !ctx.isOwner) {
      throw ApiException.forbidden('You need the comment.external permission to post a client-visible comment.');
    }

    const { comment, task } = await this.comments.create(workspaceId, userId, taskId, {
      bodyHtml: dto.bodyHtml,
      visibility,
      mentionUserIds: dto.mentionUserIds,
    });
    const view = this.comments.toView(comment);

    this.realtime.emitToWorkspace(workspaceId, 'comment.created', { comment: view }, userId);
    this.activity.record({
      workspaceId,
      projectId: task.projectId.toString(),
      taskId,
      actorUserId: userId,
      verb: 'comment.added',
      entityType: 'comment',
      entityId: comment.id,
      entityTitle: task.title,
      meta: { visibility },
    });

    const recipients = new Set<string>([
      ...task.assigneeUserIds.map((id) => id.toString()),
      task.reporterUserId.toString(),
      ...task.followerUserIds.map((id) => id.toString()),
      ...view.mentionUserIds,
    ]);
    await this.notifications.notify([...recipients], {
      workspaceId,
      type: view.mentionUserIds.length ? 'comment.mention' : 'comment.created',
      title: `New comment on ${task.key}`,
      body: task.title,
      actorUserId: userId,
      projectId: task.projectId.toString(),
      taskId,
      entityType: 'comment',
      entityId: comment.id,
    });
    return view;
  }

  @Patch(':commentId')
  @RequirePermissions('comment.create')
  @ApiOperation({ summary: 'Edit a comment (author only, unless comment.moderate)' })
  async update(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('taskId', ParseObjectIdPipe) taskId: string,
    @Param('commentId', ParseObjectIdPipe) commentId: string,
    @CurrentUser('id') userId: string,
    @Membership() ctx: WorkspaceMembershipContext,
    @Body() dto: UpdateCommentDto,
  ): Promise<CommentView> {
    const comment = await this.comments.update(
      workspaceId,
      userId,
      commentId,
      dto.bodyHtml,
      ctx.permissions.has('comment.moderate') || ctx.isOwner,
    );
    const view = this.comments.toView(comment);
    this.realtime.emitToWorkspace(workspaceId, 'comment.updated', { comment: view }, userId);
    return view;
  }

  @Delete(':commentId')
  @RequirePermissions('comment.create')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a comment (author only, unless comment.moderate)' })
  async remove(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('taskId', ParseObjectIdPipe) taskId: string,
    @Param('commentId', ParseObjectIdPipe) commentId: string,
    @CurrentUser('id') userId: string,
    @Membership() ctx: WorkspaceMembershipContext,
  ): Promise<{ message: string }> {
    await this.comments.remove(workspaceId, userId, commentId, ctx.permissions.has('comment.moderate') || ctx.isOwner);
    this.realtime.emitToWorkspace(workspaceId, 'comment.deleted', { commentId }, userId);
    return { message: 'Comment deleted.' };
  }
}
