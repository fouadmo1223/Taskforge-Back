import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Membership, RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import type { WorkspaceMembershipContext } from '../../common/context/request-context.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { AttachmentsService, type AttachmentView } from './attachments.service.js';

interface MulterFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

@ApiTags('attachments')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId/tasks/:taskId/attachments')
export class AttachmentsController {
  constructor(
    private readonly attachments: AttachmentsService,
    private readonly realtime: RealtimeService,
    private readonly tasks: TasksService,
  ) {}

  @Get()
  @RequirePermissions('task.read')
  @ApiOperation({ summary: 'List a task’s attachments' })
  async list(@Param('taskId', ParseObjectIdPipe) taskId: string): Promise<AttachmentView[]> {
    return (await this.attachments.listForTask(taskId)).map((a) => this.attachments.toView(a));
  }

  @Post()
  @RequirePermissions('task.update')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Upload an attachment to a task' })
  async upload(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('taskId', ParseObjectIdPipe) taskId: string,
    @CurrentUser('id') userId: string,
    @Membership() ctx: WorkspaceMembershipContext,
    @UploadedFile() file: MulterFile,
  ): Promise<AttachmentView> {
    await this.tasks.assertCanMutate(workspaceId, taskId, ctx);
    const doc = await this.attachments.addToTask(workspaceId, userId, taskId, file);
    const view = this.attachments.toView(doc);
    this.realtime.emitToWorkspace(workspaceId, 'task.updated', { changed: ['attachments'], attachment: view }, userId);
    return view;
  }

  @Delete(':attachmentId')
  @RequirePermissions('task.update')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete an attachment' })
  async remove(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('taskId', ParseObjectIdPipe) taskId: string,
    @Param('attachmentId', ParseObjectIdPipe) attachmentId: string,
    @Membership() ctx: WorkspaceMembershipContext,
  ): Promise<{ message: string }> {
    await this.attachments.remove(workspaceId, ctx.userId, attachmentId, ctx.permissions.has('comment.moderate') || ctx.isOwner);
    this.realtime.emitToWorkspace(workspaceId, 'task.updated', { changed: ['attachments'] }, ctx.userId);
    return { message: 'Attachment removed.' };
  }
}
