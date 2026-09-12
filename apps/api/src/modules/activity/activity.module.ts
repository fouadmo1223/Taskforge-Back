import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActivityController } from './activity.controller.js';
import { ActivityService } from './activity.service.js';
import { ActivityEvent, ActivityEventSchema } from './schemas/activity-event.schema.js';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: ActivityEvent.name, schema: ActivityEventSchema }])],
  controllers: [ActivityController],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
