import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BoardColumn, BoardColumnSchema } from '../columns/schemas/board-column.schema.js';
import { Task, TaskSchema } from '../tasks/schemas/task.schema.js';
import { CommentsModule } from '../comments/comments.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import {
  Automation,
  AutomationRun,
  AutomationRunSchema,
  AutomationSchema,
} from './schemas/automation.schema.js';
import { AutomationsController } from './automations.controller.js';
import { AutomationsService } from './automations.service.js';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Automation.name, schema: AutomationSchema },
      { name: AutomationRun.name, schema: AutomationRunSchema },
      { name: Task.name, schema: TaskSchema },
      { name: BoardColumn.name, schema: BoardColumnSchema },
    ]),
    TasksModule,
    CommentsModule,
  ],
  controllers: [AutomationsController],
  providers: [AutomationsService],
  exports: [AutomationsService],
})
export class AutomationsModule {}
