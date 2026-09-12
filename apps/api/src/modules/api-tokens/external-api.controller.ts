import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Model, Types } from 'mongoose';
import { Public } from '../../common/decorators/public.decorator.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { Project, type ProjectDocument } from '../projects/schemas/project.schema.js';
import { Task, type TaskDocument } from '../tasks/schemas/task.schema.js';
import { ApiTokenGuard, RequireApiScopes, type ApiTokenRequest } from './api-token.guard.js';

/**
 * Stable external REST surface, authenticated by personal-access tokens
 * (`Authorization: Bearer fdk_…`). Marked `@Public()` so the cookie/JWT guard
 * is skipped; {@link ApiTokenGuard} does the auth instead.
 */
@ApiTags('external-api')
@ApiSecurity('api-token')
@Public()
@UseGuards(ApiTokenGuard)
@Controller('v1/workspaces/:workspaceId')
export class ExternalApiController {
  constructor(
    @InjectModel(Project.name) private readonly projects: Model<ProjectDocument>,
    @InjectModel(Task.name) private readonly tasks: Model<TaskDocument>,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Describe the calling token' })
  me(@Req() req: ApiTokenRequest): { workspaceId: string; scopes: string[] } {
    return { workspaceId: req.apiToken!.workspaceId, scopes: [...req.apiToken!.scopes] };
  }

  @Get('projects')
  @RequireApiScopes('project.read')
  @ApiOperation({ summary: 'List projects' })
  async listProjects(@Param('workspaceId', ParseObjectIdPipe) w: string) {
    const rows = await this.projects
      .find({ workspaceId: new Types.ObjectId(w), deletedAt: null })
      .select('key name status createdAt')
      .sort({ name: 1 })
      .lean();
    return rows.map((p) => ({ id: p._id.toString(), key: p.key, name: p.name, status: p.status }));
  }

  @Get('tasks')
  @RequireApiScopes('task.read')
  @ApiOperation({ summary: 'List tasks (optionally by project)' })
  async listTasks(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Query('projectId') projectId?: string,
  ) {
    const filter: Record<string, unknown> = { workspaceId: new Types.ObjectId(w), deletedAt: null };
    if (projectId && Types.ObjectId.isValid(projectId)) filter.projectId = new Types.ObjectId(projectId);
    const rows = await this.tasks
      .find(filter)
      .select('key title priority dueDate projectId createdAt')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    return rows.map((t) => ({
      id: t._id.toString(),
      key: t.key,
      title: t.title,
      priority: t.priority,
      dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
      projectId: t.projectId.toString(),
    }));
  }
}
