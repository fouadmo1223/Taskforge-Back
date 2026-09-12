import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { SearchService, type SearchHit, type SearchType } from './search.service.js';

const VALID: SearchType[] = ['task', 'project', 'comment'];

@ApiTags('search')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId/search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @RequirePermissions('workspace.read')
  @ApiOperation({ summary: 'Search tasks, projects and comments in the workspace' })
  run(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @Query('q') q = '',
    @Query('types') types?: string,
  ): Promise<SearchHit[]> {
    const parsed = (types?.split(',').map((t) => t.trim()) ?? []).filter((t): t is SearchType => VALID.includes(t as SearchType));
    return this.search.search(workspaceId, q, parsed);
  }
}
