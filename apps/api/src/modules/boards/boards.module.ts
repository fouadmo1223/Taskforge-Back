import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BoardColumn, BoardColumnSchema } from '../columns/schemas/board-column.schema.js';
import { Task, TaskSchema } from '../tasks/schemas/task.schema.js';
import { Board, BoardSchema } from './schemas/board.schema.js';
import { BoardsController } from './boards.controller.js';
import { BoardsService } from './boards.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Board.name, schema: BoardSchema },
      { name: BoardColumn.name, schema: BoardColumnSchema },
      { name: Task.name, schema: TaskSchema },
    ]),
  ],
  controllers: [BoardsController],
  providers: [BoardsService],
  exports: [BoardsService, MongooseModule],
})
export class BoardsModule {}
