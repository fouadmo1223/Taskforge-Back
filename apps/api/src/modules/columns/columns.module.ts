import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Task, TaskSchema } from '../tasks/schemas/task.schema.js';
import { BoardColumn, BoardColumnSchema } from './schemas/board-column.schema.js';
import { ColumnsController } from './columns.controller.js';
import { ColumnsService } from './columns.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BoardColumn.name, schema: BoardColumnSchema },
      { name: Task.name, schema: TaskSchema },
    ]),
  ],
  controllers: [ColumnsController],
  providers: [ColumnsService],
  exports: [ColumnsService, MongooseModule],
})
export class ColumnsModule {}
