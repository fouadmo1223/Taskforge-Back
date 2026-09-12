import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BoardColumn, BoardColumnSchema } from '../columns/schemas/board-column.schema.js';
import { Project, ProjectSchema } from '../projects/schemas/project.schema.js';
import { Task, TaskSchema } from '../tasks/schemas/task.schema.js';
import { Portfolio, PortfolioSchema } from './schemas/portfolio.schema.js';
import { PortfoliosController } from './portfolios.controller.js';
import { PortfoliosService } from './portfolios.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Portfolio.name, schema: PortfolioSchema },
      { name: Project.name, schema: ProjectSchema },
      { name: Task.name, schema: TaskSchema },
      { name: BoardColumn.name, schema: BoardColumnSchema },
    ]),
  ],
  controllers: [PortfoliosController],
  providers: [PortfoliosService],
  exports: [PortfoliosService],
})
export class PortfoliosModule {}
