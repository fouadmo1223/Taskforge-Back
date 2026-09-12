import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BoardColumn, BoardColumnSchema } from '../columns/schemas/board-column.schema.js';
import { Project, ProjectSchema } from '../projects/schemas/project.schema.js';
import { Task, TaskSchema } from '../tasks/schemas/task.schema.js';
import { MyWorkController } from './my-work.controller.js';
import { MyWorkService } from './my-work.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Task.name, schema: TaskSchema },
      { name: Project.name, schema: ProjectSchema },
      { name: BoardColumn.name, schema: BoardColumnSchema },
    ]),
  ],
  controllers: [MyWorkController],
  providers: [MyWorkService],
})
export class MyWorkModule {}
