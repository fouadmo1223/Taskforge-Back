import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BoardColumn, BoardColumnSchema } from '../columns/schemas/board-column.schema.js';
import { Project, ProjectSchema } from '../projects/schemas/project.schema.js';
import { Task, TaskSchema } from '../tasks/schemas/task.schema.js';
import { DashboardsModule } from '../dashboards/dashboards.module.js';
import { ShareLink, ShareLinkSchema } from './schemas/share-link.schema.js';
import { PublicShareController, SharingController } from './sharing.controller.js';
import { SharingService } from './sharing.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ShareLink.name, schema: ShareLinkSchema },
      { name: Project.name, schema: ProjectSchema },
      { name: Task.name, schema: TaskSchema },
      { name: BoardColumn.name, schema: BoardColumnSchema },
    ]),
    DashboardsModule,
  ],
  controllers: [SharingController, PublicShareController],
  providers: [SharingService],
  exports: [SharingService],
})
export class SharingModule {}
