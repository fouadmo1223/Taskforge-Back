import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { DashboardsService, type DashboardView, type RenderedDashboard, type WidgetInput } from './dashboards.service.js';

class CreateDashboardDto {
  @IsString() @MinLength(1) @MaxLength(160) name!: string;
  @IsOptional() @IsBoolean() shared?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(24) widgets?: WidgetInput[];
}
class UpdateDashboardDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) name?: string;
  @IsOptional() @IsBoolean() shared?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(24) widgets?: WidgetInput[];
}

@ApiTags('dashboards')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@RequirePermissions('report.read')
@Controller('workspaces/:workspaceId/dashboards')
export class DashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Get()
  @ApiOperation({ summary: 'List dashboards (own + shared)' })
  async list(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') userId: string,
  ): Promise<DashboardView[]> {
    return (await this.dashboards.list(w, userId)).map((d) => this.dashboards.toView(d));
  }

  @Get(':dashboardId/render')
  @ApiOperation({ summary: 'Dashboard definition with each widget’s computed data' })
  render(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('dashboardId', ParseObjectIdPipe) dashboardId: string,
  ): Promise<RenderedDashboard> {
    return this.dashboards.render(w, dashboardId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a dashboard' })
  async create(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateDashboardDto,
  ): Promise<DashboardView> {
    return this.dashboards.toView(await this.dashboards.create(w, userId, dto));
  }

  @Patch(':dashboardId')
  @ApiOperation({ summary: 'Update a dashboard (owner only)' })
  async update(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('dashboardId', ParseObjectIdPipe) dashboardId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateDashboardDto,
  ): Promise<DashboardView> {
    return this.dashboards.toView(await this.dashboards.update(w, dashboardId, userId, dto));
  }

  @Delete(':dashboardId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a dashboard (owner only)' })
  async remove(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('dashboardId', ParseObjectIdPipe) dashboardId: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ message: string }> {
    await this.dashboards.remove(w, dashboardId, userId);
    return { message: 'Dashboard deleted.' };
  }
}
