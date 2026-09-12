import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { WEBHOOK_EVENTS, type WebhookEvent } from '@flowdesk/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { WebhooksService, type WebhookView } from './webhooks.service.js';

class CreateWebhookDto {
  @IsString() @MaxLength(2000) url!: string;
  @IsArray() @ArrayNotEmpty() @IsIn(WEBHOOK_EVENTS as unknown as string[], { each: true }) events!: WebhookEvent[];
}
class UpdateWebhookDto {
  @IsOptional() @IsString() @MaxLength(2000) url?: string;
  @IsOptional() @IsArray() @IsIn(WEBHOOK_EVENTS as unknown as string[], { each: true }) events?: WebhookEvent[];
  @IsOptional() @IsBoolean() active?: boolean;
}

@ApiTags('webhooks')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@RequirePermissions('webhook.manage')
@Controller('workspaces/:workspaceId/webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  @ApiOperation({ summary: 'List webhooks' })
  async list(@Param('workspaceId', ParseObjectIdPipe) w: string): Promise<WebhookView[]> {
    return (await this.webhooks.list(w)).map((h) => this.webhooks.toView(h));
  }

  @Get(':webhookId/deliveries')
  @ApiOperation({ summary: 'Recent delivery attempts' })
  async deliveries(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('webhookId', ParseObjectIdPipe) webhookId: string,
  ) {
    await this.webhooks.getOrThrow(w, webhookId);
    return (await this.webhooks.recentDeliveries(webhookId)).map((d) => ({
      id: d.id,
      event: d.event,
      status: d.status,
      ok: d.ok,
      error: d.error,
      durationMs: d.durationMs,
      createdAt: d.createdAt.toISOString(),
    }));
  }

  @Get(':webhookId/secret')
  @ApiOperation({ summary: 'Reveal the signing secret' })
  async secret(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('webhookId', ParseObjectIdPipe) webhookId: string,
  ): Promise<{ secret: string }> {
    return { secret: await this.webhooks.revealSecret(w, webhookId) };
  }

  @Post()
  @ApiOperation({ summary: 'Register a webhook' })
  async create(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateWebhookDto,
  ): Promise<WebhookView> {
    return this.webhooks.toView(await this.webhooks.create(w, userId, dto));
  }

  @Patch(':webhookId')
  @ApiOperation({ summary: 'Update a webhook' })
  async update(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('webhookId', ParseObjectIdPipe) webhookId: string,
    @Body() dto: UpdateWebhookDto,
  ): Promise<WebhookView> {
    return this.webhooks.toView(await this.webhooks.update(w, webhookId, dto));
  }

  @Post(':webhookId/test')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a test payload' })
  async test(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('webhookId', ParseObjectIdPipe) webhookId: string,
  ): Promise<{ ok: boolean; status: number | null; error: string }> {
    const d = await this.webhooks.testDelivery(w, webhookId);
    return { ok: d.ok, status: d.status, error: d.error };
  }

  @Delete(':webhookId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a webhook' })
  async remove(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('webhookId', ParseObjectIdPipe) webhookId: string,
  ): Promise<{ message: string }> {
    await this.webhooks.remove(w, webhookId);
    return { message: 'Webhook deleted.' };
  }
}
