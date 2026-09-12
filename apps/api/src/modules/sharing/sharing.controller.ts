import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';
import { SHARE_RESOURCE_TYPES, type ShareResourceType } from '@flowdesk/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { RequireAnyPermission } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { SharingService, type ShareLinkView } from './sharing.service.js';

class CreateShareDto {
  @IsIn(SHARE_RESOURCE_TYPES as unknown as string[]) resourceType!: ShareResourceType;
  @IsMongoId() resourceId!: string;
  @IsOptional() @IsInt() @Min(1) @Max(365) expiresInDays?: number;
}

const baseUrl = (): string => process.env.WEB_ORIGIN ?? process.env.APP_ORIGIN ?? 'http://localhost:5173';

@ApiTags('sharing')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId/share-links')
export class SharingController {
  constructor(private readonly sharing: SharingService) {}

  @Get()
  @RequireAnyPermission('project.update', 'report.read')
  @ApiOperation({ summary: 'List share links for a resource' })
  async list(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Query('resourceType') resourceType: ShareResourceType,
    @Query('resourceId') resourceId: string,
  ): Promise<ShareLinkView[]> {
    return (await this.sharing.listForResource(w, resourceType, resourceId)).map((l) => this.sharing.toView(l, baseUrl()));
  }

  @Post()
  @RequireAnyPermission('project.update', 'report.read')
  @ApiOperation({ summary: 'Create a read-only public link' })
  async create(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateShareDto,
  ): Promise<ShareLinkView> {
    return this.sharing.toView(await this.sharing.create(w, userId, dto), baseUrl());
  }

  @Delete(':linkId')
  @RequireAnyPermission('project.update', 'report.read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke a share link' })
  async revoke(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('linkId', ParseObjectIdPipe) linkId: string,
  ): Promise<{ message: string }> {
    await this.sharing.revoke(w, linkId);
    return { message: 'Link revoked.' };
  }
}

@ApiTags('sharing')
@Controller('share')
export class PublicShareController {
  constructor(private readonly sharing: SharingService) {}

  @Get(':token')
  @Public()
  @ApiOperation({ summary: 'Resolve a public share link (unauthenticated, read-only)' })
  resolve(@Param('token') token: string): Promise<{ resourceType: ShareResourceType; snapshot: unknown }> {
    return this.sharing.resolve(token);
  }
}
