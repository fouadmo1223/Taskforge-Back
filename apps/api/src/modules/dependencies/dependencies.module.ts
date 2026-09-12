import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Task, TaskSchema } from '../tasks/schemas/task.schema.js';
import { TaskDependency, TaskDependencySchema } from './schemas/task-dependency.schema.js';
import { DependenciesController } from './dependencies.controller.js';
import { DependenciesService } from './dependencies.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TaskDependency.name, schema: TaskDependencySchema },
      { name: Task.name, schema: TaskSchema },
    ]),
  ],
  controllers: [DependenciesController],
  providers: [DependenciesService],
  exports: [DependenciesService],
})
export class DependenciesModule {}
