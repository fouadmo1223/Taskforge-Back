import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkspaceMembership, WorkspaceMembershipSchema } from '../memberships/schemas/workspace-membership.schema.js';
import { Project, ProjectSchema } from '../projects/schemas/project.schema.js';
import { Task, TaskSchema } from '../tasks/schemas/task.schema.js';
import {
  Availability,
  AvailabilityException,
  AvailabilityExceptionSchema,
  AvailabilitySchema,
} from './schemas/availability.schema.js';
import { WorkloadController } from './workload.controller.js';
import { WorkloadService } from './workload.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Availability.name, schema: AvailabilitySchema },
      { name: AvailabilityException.name, schema: AvailabilityExceptionSchema },
      { name: Task.name, schema: TaskSchema },
      { name: Project.name, schema: ProjectSchema },
      { name: WorkspaceMembership.name, schema: WorkspaceMembershipSchema },
    ]),
  ],
  controllers: [WorkloadController],
  providers: [WorkloadService],
  exports: [WorkloadService],
})
export class WorkloadModule {}
