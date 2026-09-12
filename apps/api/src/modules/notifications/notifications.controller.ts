import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsBooleanString, IsMongoId, IsOptional } from 'class-validator';
import type { CursorPage } from '@flowdesk/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { CursorPageQueryDto } from '../../common/dto/pagination.dto.js';
import { NotificationsService, type NotificationView } from './notifications.service.js';

class NotificationsQueryDto extends CursorPageQueryDto {
  @IsOptional() @IsBooleanString() unreadOnly?: string;
}

class MarkReadDto {
  @IsArray() @ArrayNotEmpty() @IsMongoId({ each: true }) ids!: string[];
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List my notifications (cursor paginated)' })
  list(
    @CurrentUser('id') userId: string,
    @Query() q: NotificationsQueryDto,
  ): Promise<CursorPage<NotificationView>> {
    return this.notifications.list(userId, { cursor: q.cursor, limit: q.limit, unreadOnly: q.unreadOnly === 'true' });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Count my unread notifications' })
  async unread(@CurrentUser('id') userId: string): Promise<{ count: number }> {
    return { count: await this.notifications.unreadCount(userId) };
  }

  @Patch('read')
  @ApiOperation({ summary: 'Mark specific notifications read' })
  async markRead(@CurrentUser('id') userId: string, @Body() dto: MarkReadDto): Promise<{ ok: true }> {
    await this.notifications.markRead(userId, dto.ids);
    return { ok: true };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all my notifications read' })
  async markAll(@CurrentUser('id') userId: string): Promise<{ ok: true }> {
    await this.notifications.markAllRead(userId);
    return { ok: true };
  }
}
