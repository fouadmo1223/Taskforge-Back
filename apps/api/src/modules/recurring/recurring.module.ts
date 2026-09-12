import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProjectsModule } from '../projects/projects.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { RecurringTask, RecurringTaskSchema } from './schemas/recurring-task.schema.js';
import { RecurringController } from './recurring.controller.js';
import { RecurringService } from './recurring.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: RecurringTask.name, schema: RecurringTaskSchema }]),
    ProjectsModule,
    TasksModule,
  ],
  controllers: [RecurringController],
  providers: [RecurringService],
  exports: [RecurringService],
})
export class RecurringModule {}
