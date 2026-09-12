import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApprovalsModule } from '../approvals/approvals.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { Deliverable, DeliverableSchema } from './schemas/deliverable.schema.js';
import { DeliverablesController } from './deliverables.controller.js';
import { DeliverablesService } from './deliverables.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Deliverable.name, schema: DeliverableSchema }]),
    ApprovalsModule,
    ProjectsModule,
  ],
  controllers: [DeliverablesController],
  providers: [DeliverablesService],
  exports: [DeliverablesService, MongooseModule],
})
export class DeliverablesModule {}
