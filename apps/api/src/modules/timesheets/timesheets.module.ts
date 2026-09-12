import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Task, TaskSchema } from '../tasks/schemas/task.schema.js';
import { TimeEntry, TimeEntrySchema } from '../time-tracking/schemas/time-entry.schema.js';
import { Timesheet, TimesheetSchema } from './schemas/timesheet.schema.js';
import { TimesheetsController } from './timesheets.controller.js';
import { TimesheetsService } from './timesheets.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Timesheet.name, schema: TimesheetSchema },
      { name: TimeEntry.name, schema: TimeEntrySchema },
      { name: Task.name, schema: TaskSchema },
    ]),
  ],
  controllers: [TimesheetsController],
  providers: [TimesheetsService],
  exports: [TimesheetsService],
})
export class TimesheetsModule {}
