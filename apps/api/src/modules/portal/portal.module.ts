import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BoardColumn, BoardColumnSchema } from '../columns/schemas/board-column.schema.js';
import { Task, TaskSchema } from '../tasks/schemas/task.schema.js';
import { ApprovalsModule } from '../approvals/approvals.module.js';
import { ClientsModule } from '../clients/clients.module.js';
import { DeliverablesModule } from '../deliverables/deliverables.module.js';
import { IntakeModule } from '../intake/intake.module.js';
import { MilestonesModule } from '../milestones/milestones.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { PortalController } from './portal.controller.js';
import { PortalService } from './portal.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Task.name, schema: TaskSchema },
      { name: BoardColumn.name, schema: BoardColumnSchema },
    ]),
    ApprovalsModule,
    ClientsModule,
    DeliverablesModule,
    IntakeModule,
    MilestonesModule,
    ProjectsModule,
  ],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
