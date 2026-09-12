import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BoardColumn, BoardColumnSchema } from '../columns/schemas/board-column.schema.js';
import { Project, ProjectSchema } from '../projects/schemas/project.schema.js';
import { Task, TaskSchema } from '../tasks/schemas/task.schema.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Project.name, schema: ProjectSchema },
      { name: Task.name, schema: TaskSchema },
      { name: BoardColumn.name, schema: BoardColumnSchema },
    ]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
