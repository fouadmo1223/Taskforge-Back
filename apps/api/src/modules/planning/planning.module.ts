import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BoardColumn, BoardColumnSchema } from '../columns/schemas/board-column.schema.js';
import { DependenciesModule } from '../dependencies/dependencies.module.js';
import { MilestonesModule } from '../milestones/milestones.module.js';
import { Task, TaskSchema } from '../tasks/schemas/task.schema.js';
import { ProjectBaseline, ProjectBaselineSchema } from './schemas/project-baseline.schema.js';
import { PlanningController } from './planning.controller.js';
import { PlanningService } from './planning.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Task.name, schema: TaskSchema },
      { name: BoardColumn.name, schema: BoardColumnSchema },
      { name: ProjectBaseline.name, schema: ProjectBaselineSchema },
    ]),
    DependenciesModule,
    MilestonesModule,
  ],
  controllers: [PlanningController],
  providers: [PlanningService],
  exports: [PlanningService],
})
export class PlanningModule {}
