import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BoardsModule } from '../boards/boards.module.js';
import { ColumnsModule } from '../columns/columns.module.js';
import { LabelsModule } from '../labels/labels.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { BoardViewController } from './board-view.controller.js';
import { Task, TaskSchema } from './schemas/task.schema.js';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Task.name, schema: TaskSchema }]),
    ProjectsModule,
    BoardsModule,
    ColumnsModule,
    LabelsModule,
  ],
  controllers: [TasksController, BoardViewController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
