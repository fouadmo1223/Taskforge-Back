import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString } from 'class-validator';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { AuditService } from './audit.service.js';

class AuditQueryDto {
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsMongoId() entityId?: string;
}

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId/audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit.read')
  @ApiOperation({ summary: 'Security audit log (most recent first)' })
  async list(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Query() query: AuditQueryDto,
  ): Promise<unknown[]> {
    const rows = await this.audit.list(workspaceId, query);
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      actor:
        r.actorUserId && typeof r.actorUserId === 'object' && 'name' in r.actorUserId
          ? { id: String((r.actorUserId as unknown as { _id: unknown })._id), name: (r.actorUserId as unknown as { name: string }).name }
          : { id: null, name: r.actorLabel ?? 'System' },
      before: r.before,
      after: r.after,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
