import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Membership, RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import type { WorkspaceMembershipContext } from '../../common/context/request-context.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { ApiTokensService, type ApiTokenView } from './api-tokens.service.js';

class CreateApiTokenDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) scopes!: string[];
  @IsOptional() @IsInt() @Min(1) @Max(3650) expiresInDays?: number;
}

@ApiTags('api-tokens')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@RequirePermissions('apitoken.manage')
@Controller('workspaces/:workspaceId/api-tokens')
export class ApiTokensController {
  constructor(private readonly tokens: ApiTokensService) {}

  @Get()
  @ApiOperation({ summary: 'List API tokens (no secrets)' })
  async list(@Param('workspaceId', ParseObjectIdPipe) w: string): Promise<ApiTokenView[]> {
    return (await this.tokens.list(w)).map((t) => this.tokens.toView(t));
  }

  @Post()
  @ApiOperation({ summary: 'Create an API token — the raw value is returned once' })
  async create(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') userId: string,
    @Membership() ctx: WorkspaceMembershipContext,
    @Body() dto: CreateApiTokenDto,
  ): Promise<ApiTokenView & { token: string }> {
    const { token, raw } = await this.tokens.create(
      w,
      userId,
      ctx.isOwner ? 'all' : ctx.permissions,
      dto,
    );
    return { ...this.tokens.toView(token), token: raw };
  }

  @Delete(':tokenId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke an API token' })
  async revoke(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('tokenId', ParseObjectIdPipe) tokenId: string,
  ): Promise<{ message: string }> {
    await this.tokens.revoke(w, tokenId);
    return { message: 'Token revoked.' };
  }
}
