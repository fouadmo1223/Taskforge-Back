import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Task, TaskSchema } from '../tasks/schemas/task.schema.js';
import { Workspace, WorkspaceSchema } from '../workspaces/schemas/workspace.schema.js';
import { ActiveTimer, ActiveTimerSchema } from './schemas/active-timer.schema.js';
import { TimeEntry, TimeEntrySchema } from './schemas/time-entry.schema.js';
import { TimeTrackingController } from './time-tracking.controller.js';
import { TimeTrackingService } from './time-tracking.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ActiveTimer.name, schema: ActiveTimerSchema },
      { name: TimeEntry.name, schema: TimeEntrySchema },
      { name: Task.name, schema: TaskSchema },
      { name: Workspace.name, schema: WorkspaceSchema },
    ]),
  ],
  controllers: [TimeTrackingController],
  providers: [TimeTrackingService],
  exports: [TimeTrackingService, MongooseModule],
})
export class TimeTrackingModule {}
