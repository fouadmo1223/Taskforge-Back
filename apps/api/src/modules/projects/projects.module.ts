import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Board, BoardSchema } from '../boards/schemas/board.schema.js';
import { BoardColumn, BoardColumnSchema } from '../columns/schemas/board-column.schema.js';
import { Workspace, WorkspaceSchema } from '../workspaces/schemas/workspace.schema.js';
import { Project, ProjectSchema } from './schemas/project.schema.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Project.name, schema: ProjectSchema },
      { name: Board.name, schema: BoardSchema },
      { name: BoardColumn.name, schema: BoardColumnSchema },
      { name: Workspace.name, schema: WorkspaceSchema },
    ]),
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService, MongooseModule],
})
export class ProjectsModule {}
