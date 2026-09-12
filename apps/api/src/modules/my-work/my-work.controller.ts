import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { MyWorkService, type MyWorkResponse } from './my-work.service.js';

@ApiTags('my-work')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId/my-work')
export class MyWorkController {
  constructor(private readonly myWork: MyWorkService) {}

  @Get()
  @RequirePermissions('task.read')
  @ApiOperation({ summary: 'Tasks assigned to / reported by / followed by the current user' })
  get(
    @Param('workspaceId', ParseObjectIdPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
  ): Promise<MyWorkResponse> {
    return this.myWork.forUser(workspaceId, userId);
  }
}
