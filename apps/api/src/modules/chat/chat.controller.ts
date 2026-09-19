import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { CursorPage } from '@flowdesk/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { CursorPageQueryDto } from '../../common/dto/pagination.dto.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { CloudinaryService } from '../../infra/cloudinary/cloudinary.service.js';
import { ChatService, type ChatMessageView, type ConversationView } from './chat.service.js';

interface MulterFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

class CreateDirectDto {
  @IsMongoId() userId!: string;
}
class CreateGroupDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsArray() @ArrayNotEmpty() @IsMongoId({ each: true }) memberUserIds!: string[];
}
class RenameDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
}
class AddMembersDto {
  @IsArray() @ArrayNotEmpty() @IsMongoId({ each: true }) userIds!: string[];
}
class SendMessageDto {
  @IsString() @MinLength(1) @MaxLength(4000) body!: string;
  @IsOptional() @IsArray() @IsMongoId({ each: true }) mentionUserIds?: string[];
}
class EditMessageDto {
  @IsString() @MinLength(1) @MaxLength(4000) body!: string;
}
class MarkReadDto {
  @IsOptional() @IsMongoId() messageId?: string;
}
class ForwardMessageDto {
  @IsArray() @ArrayNotEmpty() @IsMongoId({ each: true }) toConversationIds!: string[];
}
class ReactDto {
  @IsString() @MinLength(1) @MaxLength(16) emoji!: string;
}

@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@RequirePermissions('workspace.read')
@Controller('workspaces/:workspaceId/conversations')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'My conversations (direct + groups) with unread counts' })
  async list(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') u: string,
  ): Promise<ConversationView[]> {
    return this.chat.list(w, u);
  }

  @Post('direct')
  @ApiOperation({ summary: 'Open (or reuse) a direct message with another member' })
  async direct(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') u: string,
    @Body() dto: CreateDirectDto,
  ): Promise<ConversationView> {
    const convo = await this.chat.getOrCreateDirect(w, u, dto.userId);
    return this.chat.conversationView(convo, 0);
  }

  @Post('groups')
  @ApiOperation({ summary: 'Create a group conversation' })
  async group(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') u: string,
    @Body() dto: CreateGroupDto,
  ): Promise<ConversationView> {
    const convo = await this.chat.createGroup(w, u, dto.name, dto.memberUserIds);
    return this.chat.conversationView(convo, 0);
  }

  @Patch(':conversationId')
  @ApiOperation({ summary: 'Rename a group' })
  async rename(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('conversationId', ParseObjectIdPipe) c: string,
    @CurrentUser('id') u: string,
    @Body() dto: RenameDto,
  ): Promise<ConversationView> {
    return this.chat.conversationView(await this.chat.renameGroup(w, c, u, dto.name), 0);
  }

  @Post(':conversationId/members')
  @ApiOperation({ summary: 'Add members to a group' })
  async addMembers(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('conversationId', ParseObjectIdPipe) c: string,
    @CurrentUser('id') u: string,
    @Body() dto: AddMembersDto,
  ): Promise<ConversationView> {
    return this.chat.conversationView(await this.chat.addMembers(w, c, u, dto.userIds), 0);
  }

  @Delete(':conversationId/members/:userId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove a member from a group / leave a group' })
  async removeMember(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('conversationId', ParseObjectIdPipe) c: string,
    @Param('userId', ParseObjectIdPipe) targetUserId: string,
    @CurrentUser('id') u: string,
  ): Promise<{ message: string }> {
    await this.chat.removeMember(w, c, u, targetUserId);
    return { message: 'Done.' };
  }

  @Get(':conversationId/messages')
  @ApiOperation({ summary: 'Messages in a conversation (cursor paginated, oldest→newest per page)' })
  messages(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('conversationId', ParseObjectIdPipe) c: string,
    @CurrentUser('id') u: string,
    @Query() q: CursorPageQueryDto,
  ): Promise<CursorPage<ChatMessageView>> {
    return this.chat.listMessages(w, c, u, q);
  }

  @Get(':conversationId/messages/search')
  @ApiOperation({ summary: 'Search this conversation\'s message history by text' })
  search(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('conversationId', ParseObjectIdPipe) c: string,
    @CurrentUser('id') u: string,
    @Query('q') q?: string,
  ): Promise<ChatMessageView[]> {
    return this.chat.searchMessages(w, c, u, q ?? '');
  }

  @Post(':conversationId/messages')
  @ApiOperation({ summary: 'Send a message' })
  send(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('conversationId', ParseObjectIdPipe) c: string,
    @CurrentUser('id') u: string,
    @Body() dto: SendMessageDto,
  ): Promise<ChatMessageView> {
    return this.chat.send(w, c, u, dto.body, dto.mentionUserIds ?? []);
  }

  @Post(':conversationId/messages/image')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Send an image message (optional caption via the `caption` field)' })
  async sendImage(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('conversationId', ParseObjectIdPipe) c: string,
    @CurrentUser('id') u: string,
    @UploadedFile() file: MulterFile,
    @Body('caption') caption?: string,
  ): Promise<ChatMessageView> {
    const asset = await this.cloudinary.upload({
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
      size: file.size,
      uploaderUserId: u,
      folder: 'chat',
    });
    return this.chat.send(w, c, u, caption ?? '', [], asset);
  }

  @Patch(':conversationId/messages/:messageId')
  @ApiOperation({ summary: 'Edit a message' })
  edit(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('conversationId', ParseObjectIdPipe) c: string,
    @Param('messageId', ParseObjectIdPipe) m: string,
    @CurrentUser('id') u: string,
    @Body() dto: EditMessageDto,
  ): Promise<ChatMessageView> {
    return this.chat.edit(w, c, m, u, dto.body);
  }

  @Delete(':conversationId/messages/:messageId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a message — `scope=me` (default) hides it just for you, `scope=everyone` removes it for the whole conversation (sender only, 15-minute window)' })
  async remove(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('conversationId', ParseObjectIdPipe) c: string,
    @Param('messageId', ParseObjectIdPipe) m: string,
    @CurrentUser('id') u: string,
    @Query('scope') scope?: 'me' | 'everyone',
  ): Promise<{ message: string }> {
    await this.chat.remove(w, c, m, u, scope === 'everyone' ? 'everyone' : 'me');
    return { message: 'Message deleted.' };
  }

  @Post(':conversationId/messages/:messageId/forward')
  @ApiOperation({ summary: 'Forward a message into one or more other conversations' })
  forward(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('conversationId', ParseObjectIdPipe) c: string,
    @Param('messageId', ParseObjectIdPipe) m: string,
    @CurrentUser('id') u: string,
    @Body() dto: ForwardMessageDto,
  ): Promise<ChatMessageView[]> {
    return this.chat.forward(w, u, c, m, dto.toConversationIds);
  }

  @Post(':conversationId/messages/:messageId/reactions')
  @ApiOperation({ summary: 'React to a message with an emoji — reacting with the same emoji again removes it' })
  react(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('conversationId', ParseObjectIdPipe) c: string,
    @Param('messageId', ParseObjectIdPipe) m: string,
    @CurrentUser('id') u: string,
    @Body() dto: ReactDto,
  ): Promise<ChatMessageView> {
    return this.chat.toggleReaction(w, c, m, u, dto.emoji);
  }

  @Get(':conversationId/reads')
  @ApiOperation({ summary: "Per-member read state for a conversation (for read receipts / 'seen by')" })
  readReceipts(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('conversationId', ParseObjectIdPipe) c: string,
    @CurrentUser('id') u: string,
  ): Promise<Array<{ userId: string; lastReadMessageId: string | null; lastReadAt: string }>> {
    return this.chat.readReceipts(w, c, u);
  }

  @Post(':conversationId/read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark a conversation read up to a message' })
  async read(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('conversationId', ParseObjectIdPipe) c: string,
    @CurrentUser('id') u: string,
    @Body() dto: MarkReadDto,
  ): Promise<{ ok: true }> {
    await this.chat.markRead(w, c, u, dto.messageId ?? null);
    return { ok: true };
  }
}
