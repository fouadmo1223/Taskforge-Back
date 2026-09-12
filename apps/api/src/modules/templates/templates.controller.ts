import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsMongoId, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TEMPLATE_KINDS, type TemplateKind } from '@flowdesk/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { TemplatesService, type TemplateView } from './templates.service.js';

class CreateTemplateDto {
  @IsIn(TEMPLATE_KINDS as unknown as string[]) kind!: TemplateKind;
  @IsString() @MinLength(1) @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsObject() payload!: Record<string, unknown>;
}
class UpdateTemplateDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
}
class InstantiateTaskDto {
  @IsMongoId() projectId!: string;
  @IsOptional() @IsMongoId() columnId?: string;
}
class InstantiateProjectDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(6) key?: string;
}

@ApiTags('templates')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId/templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @RequirePermissions('project.read')
  @ApiOperation({ summary: 'List templates' })
  async list(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Query('kind') kind?: TemplateKind,
  ): Promise<TemplateView[]> {
    return (await this.templates.list(w, kind)).map((t) => this.templates.toView(t));
  }

  @Post()
  @RequirePermissions('template.manage')
  @ApiOperation({ summary: 'Create a template' })
  async create(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTemplateDto,
  ): Promise<TemplateView> {
    return this.templates.toView(await this.templates.create(w, userId, dto));
  }

  @Patch(':templateId')
  @RequirePermissions('template.manage')
  @ApiOperation({ summary: 'Update a template' })
  async update(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('templateId', ParseObjectIdPipe) templateId: string,
    @Body() dto: UpdateTemplateDto,
  ): Promise<TemplateView> {
    return this.templates.toView(await this.templates.update(w, templateId, dto));
  }

  @Delete(':templateId')
  @RequirePermissions('template.manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a template' })
  async remove(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('templateId', ParseObjectIdPipe) templateId: string,
  ): Promise<{ message: string }> {
    await this.templates.remove(w, templateId);
    return { message: 'Template deleted.' };
  }

  @Post(':templateId/instantiate-task')
  @RequirePermissions('task.create')
  @HttpCode(200)
  @ApiOperation({ summary: 'Create tasks from a task template' })
  instantiateTask(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('templateId', ParseObjectIdPipe) templateId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: InstantiateTaskDto,
  ): Promise<{ rootTaskId: string; created: number }> {
    return this.templates.instantiateTask(w, templateId, userId, dto);
  }

  @Post(':templateId/instantiate-project')
  @RequirePermissions('project.create')
  @HttpCode(200)
  @ApiOperation({ summary: 'Create a project from a project template' })
  instantiateProject(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('templateId', ParseObjectIdPipe) templateId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: InstantiateProjectDto,
  ): Promise<{ projectId: string; created: number }> {
    return this.templates.instantiateProject(w, templateId, userId, dto);
  }
}
