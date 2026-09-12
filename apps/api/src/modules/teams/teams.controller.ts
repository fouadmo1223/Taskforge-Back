import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsHexColor, IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { TeamsService, type TeamView } from './teams.service.js';

class CreateTeamDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsHexColor() color?: string;
  @IsOptional() @IsMongoId() leadUserId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsMongoId({ each: true }) memberUserIds?: string[];
}
class UpdateTeamDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsHexColor() color?: string;
  @IsOptional() @IsMongoId() leadUserId?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsMongoId({ each: true }) memberUserIds?: string[];
  @IsOptional() @IsBoolean() archived?: boolean;
}

@ApiTags('teams')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId/teams')
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get()
  @RequirePermissions('members.read')
  @ApiOperation({ summary: 'List teams' })
  async list(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Query('includeArchived') includeArchived?: string,
  ): Promise<TeamView[]> {
    return (await this.teams.list(w, includeArchived === 'true')).map((tm) => this.teams.toView(tm));
  }

  @Post()
  @RequirePermissions('team.manage')
  @ApiOperation({ summary: 'Create a team' })
  async create(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTeamDto,
  ): Promise<TeamView> {
    return this.teams.toView(await this.teams.create(w, userId, dto));
  }

  @Patch(':teamId')
  @RequirePermissions('team.manage')
  @ApiOperation({ summary: 'Update a team / its members' })
  async update(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('teamId', ParseObjectIdPipe) teamId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateTeamDto,
  ): Promise<TeamView> {
    return this.teams.toView(await this.teams.update(w, teamId, userId, dto));
  }

  @Delete(':teamId')
  @RequirePermissions('team.manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a team' })
  async remove(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('teamId', ParseObjectIdPipe) teamId: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ message: string }> {
    await this.teams.remove(w, teamId, userId);
    return { message: 'Team deleted.' };
  }
}
