import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsMongoId, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AUTOMATION_TRIGGERS, type AutomationTrigger } from '@flowdesk/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { AutomationsService, type AutomationContext, type AutomationView } from './automations.service.js';

class TriggerDto {
  @IsIn(AUTOMATION_TRIGGERS as unknown as string[]) type!: AutomationTrigger;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}
class ConditionDto {
  @IsString() @MaxLength(60) field!: string;
  @IsString() @MaxLength(20) op!: string;
  @IsOptional() value?: unknown;
}
class ActionDto {
  @IsString() @MaxLength(40) type!: string;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}

class CreateAutomationDto {
  @IsString() @MinLength(1) @MaxLength(160) name!: string;
  @IsOptional() @IsMongoId() projectId?: string;
  @IsObject() trigger!: TriggerDto;
  @IsOptional() @IsArray() @ArrayMaxSize(10) conditions?: ConditionDto[];
  @IsArray() @ArrayMaxSize(10) actions!: ActionDto[];
  @IsOptional() @IsBoolean() active?: boolean;
}
class UpdateAutomationDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsMongoId() projectId?: string | null;
  @IsOptional() @IsObject() trigger?: TriggerDto;
  @IsOptional() @IsArray() @ArrayMaxSize(10) conditions?: ConditionDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(10) actions?: ActionDto[];
}
class TestAutomationDto {
  @IsObject() context!: AutomationContext;
}

@ApiTags('automations')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId/automations')
export class AutomationsController {
  constructor(private readonly automations: AutomationsService) {}

  @Get()
  @RequirePermissions('automation.manage')
  @ApiOperation({ summary: 'List automations' })
  async list(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Query('projectId') projectId?: string,
  ): Promise<AutomationView[]> {
    return (await this.automations.list(w, projectId)).map((a) => this.automations.toView(a));
  }

  @Get(':id/runs')
  @RequirePermissions('automation.manage')
  @ApiOperation({ summary: 'Recent automation runs' })
  async runs(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    await this.automations.getOrThrow(w, id);
    return (await this.automations.recentRuns(id)).map((r) => ({
      id: r.id,
      status: r.status,
      trigger: r.trigger,
      actionsRun: r.actionsRun,
      error: r.error,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  @Post()
  @RequirePermissions('automation.manage')
  @ApiOperation({ summary: 'Create an automation' })
  async create(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAutomationDto,
  ): Promise<AutomationView> {
    return this.automations.toView(await this.automations.create(w, userId, dto));
  }

  @Patch(':id')
  @RequirePermissions('automation.manage')
  @ApiOperation({ summary: 'Update an automation' })
  async update(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateAutomationDto,
  ): Promise<AutomationView> {
    return this.automations.toView(await this.automations.update(w, id, dto));
  }

  @Delete(':id')
  @RequirePermissions('automation.manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete an automation' })
  async remove(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<{ message: string }> {
    await this.automations.remove(w, id);
    return { message: 'Automation deleted.' };
  }

  @Post(':id/test')
  @RequirePermissions('automation.manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Run an automation once against a sample context' })
  async test(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: TestAutomationDto,
  ): Promise<{ status: string; actionsRun: string[]; error: string }> {
    const run = await this.automations.test(w, id, userId, dto.context ?? {});
    return { status: run.status, actionsRun: run.actionsRun, error: run.error };
  }

  @Post('run')
  @RequirePermissions('automation.manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Evaluate time-based automations (schedule / overdue / due-soon)' })
  run(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ automations: number; executed: number }> {
    return this.automations.runScheduled(w, userId);
  }
}
