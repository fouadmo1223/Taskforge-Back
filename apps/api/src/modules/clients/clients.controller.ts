import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsEmail, IsIn, IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { ClientsService, type ClientView } from './clients.service.js';

class CreateClientDto {
  @IsString() @MinLength(1) @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(120) contactName?: string;
  @IsOptional() @IsEmail() contactEmail?: string;
  @IsOptional() @IsString() @MaxLength(40) contactPhone?: string;
  @IsOptional() @IsString() @MaxLength(200) website?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}
class UpdateClientDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(120) contactName?: string;
  @IsOptional() @IsEmail() contactEmail?: string;
  @IsOptional() @IsString() @MaxLength(40) contactPhone?: string;
  @IsOptional() @IsString() @MaxLength(200) website?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @IsOptional() @IsIn(['active', 'archived']) status?: 'active' | 'archived';
}
class SetProjectsDto {
  @IsArray() @IsMongoId({ each: true }) projectIds!: string[];
}

@ApiTags('clients')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId/clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @RequirePermissions('client.read')
  @ApiOperation({ summary: 'List clients' })
  async list(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Query('includeArchived') includeArchived?: string,
  ): Promise<ClientView[]> {
    return (await this.clients.list(w, { includeArchived: includeArchived === 'true' })).map((c) => this.clients.toView(c));
  }

  @Get(':clientId')
  @RequirePermissions('client.read')
  @ApiOperation({ summary: 'Get one client' })
  async getOne(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('clientId', ParseObjectIdPipe) clientId: string,
  ): Promise<ClientView> {
    return this.clients.toView(await this.clients.getOrThrow(w, clientId));
  }

  @Post()
  @RequirePermissions('client.manage')
  @ApiOperation({ summary: 'Create a client' })
  async create(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateClientDto,
  ): Promise<ClientView> {
    return this.clients.toView(await this.clients.create(w, userId, dto));
  }

  @Patch(':clientId')
  @RequirePermissions('client.manage')
  @ApiOperation({ summary: 'Update a client' })
  async update(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('clientId', ParseObjectIdPipe) clientId: string,
    @Body() dto: UpdateClientDto,
  ): Promise<ClientView> {
    return this.clients.toView(await this.clients.update(w, clientId, dto));
  }

  @Patch(':clientId/projects')
  @RequirePermissions('client.manage')
  @ApiOperation({ summary: 'Set the projects linked to a client' })
  async setProjects(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('clientId', ParseObjectIdPipe) clientId: string,
    @Body() dto: SetProjectsDto,
  ): Promise<ClientView> {
    return this.clients.toView(await this.clients.setProjects(w, clientId, dto.projectIds));
  }

  @Delete(':clientId')
  @RequirePermissions('client.manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a client' })
  async remove(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('clientId', ParseObjectIdPipe) clientId: string,
  ): Promise<{ message: string }> {
    await this.clients.softDelete(w, clientId);
    return { message: 'Client deleted.' };
  }
}
