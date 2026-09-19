import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard.js';
import { AuditService } from '../audit/audit.service.js';

export interface AdminAuditLogView {
  id: string;
  workspaceId: string | null;
  actorName: string | null;
  actorLabel: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
}

export interface AdminActivityPage {
  items: AdminAuditLogView[];
  nextCursor: string | null;
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(PlatformAdminGuard)
@Controller('admin/activity')
export class AdminActivityController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: '[Platform admin] Cross-workspace admin/security activity, newest first' })
  @ApiQuery({ name: 'cursor', required: false, description: 'ISO timestamp from a previous page\'s nextCursor' })
  @ApiQuery({ name: 'limit', required: false })
  async list(@Query('cursor') cursor?: string, @Query('limit') limit?: string): Promise<AdminActivityPage> {
    const rows = await this.audit.listAll({
      before: cursor ? new Date(cursor) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    const items = rows.map((r) => {
      const actor = r.actorUserId as unknown as { name?: string } | null;
      return {
        id: r.id,
        workspaceId: r.workspaceId?.toString() ?? null,
        actorName: actor?.name ?? null,
        actorLabel: r.actorLabel,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        createdAt: r.createdAt.toISOString(),
      };
    });
    const last = rows.at(-1);
    return { items, nextCursor: last ? last.createdAt.toISOString() : null };
  }
}
