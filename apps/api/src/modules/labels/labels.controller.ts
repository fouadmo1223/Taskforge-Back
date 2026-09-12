import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsHexColor, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { LabelsService, type LabelView } from './labels.service.js';

class CreateLabelDto {
  @IsString() @MinLength(1) @MaxLength(40) name!: string;
  @IsOptional() @IsHexColor() color?: string;
  @IsOptional() @IsString() projectId?: string | null;
}
class UpdateLabelDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) name?: string;
  @IsOptional() @IsHexColor() color?: string;
}

@ApiTags('labels')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId/labels')
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Get()
  @RequirePermissions('project.read')
  @ApiOperation({ summary: 'List all workspace labels' })
  async list(@Param('workspaceId', ParseObjectIdPipe) workspaceId: string): Promise<LabelView[]> {
    return (await this.labels.listForWorkspace(workspaceId)).map((l) => this.labels.toView(l));
  }

  @Post()
  @RequirePermissions('project.update')
  @ApiOperation({ summary: 'Create a label (workspace-wide or project-scoped)' })
  async create(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Body() dto: CreateLabelDto,
  ): Promise<LabelView> {
    return this.labels.toView(await this.labels.create(workspaceId, dto));
  }

  @Patch(':labelId')
  @RequirePermissions('project.update')
  @ApiOperation({ summary: 'Rename or recolor a label' })
  async update(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('labelId', ParseObjectIdPipe) labelId: string,
    @Body() dto: UpdateLabelDto,
  ): Promise<LabelView> {
    return this.labels.toView(await this.labels.update(workspaceId, labelId, dto));
  }

  @Delete(':labelId')
  @RequirePermissions('project.update')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a label' })
  async remove(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Param('labelId', ParseObjectIdPipe) labelId: string,
  ): Promise<{ message: string }> {
    await this.labels.remove(workspaceId, labelId);
    return { message: 'Label deleted.' };
  }
}
