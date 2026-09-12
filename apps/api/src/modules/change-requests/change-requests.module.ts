import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApprovalsModule } from '../approvals/approvals.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { ChangeRequest, ChangeRequestSchema } from './schemas/change-request.schema.js';
import { ChangeRequestsController } from './change-requests.controller.js';
import { ChangeRequestsService } from './change-requests.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ChangeRequest.name, schema: ChangeRequestSchema }]),
    ApprovalsModule,
    ProjectsModule,
  ],
  controllers: [ChangeRequestsController],
  providers: [ChangeRequestsService],
  exports: [ChangeRequestsService],
})
export class ChangeRequestsModule {}
