import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BoardColumn, BoardColumnSchema } from '../columns/schemas/board-column.schema.js';
import { Task, TaskSchema } from '../tasks/schemas/task.schema.js';
import { SlaPolicy, SlaPolicySchema, SlaTracker, SlaTrackerSchema } from './schemas/sla.schema.js';
import { SlaController } from './sla.controller.js';
import { SlaService } from './sla.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SlaPolicy.name, schema: SlaPolicySchema },
      { name: SlaTracker.name, schema: SlaTrackerSchema },
      { name: Task.name, schema: TaskSchema },
      { name: BoardColumn.name, schema: BoardColumnSchema },
    ]),
  ],
  controllers: [SlaController],
  providers: [SlaService],
  exports: [SlaService],
})
export class SlaModule {}
