import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Label, LabelSchema } from './schemas/label.schema.js';
import { LabelsController } from './labels.controller.js';
import { LabelsService } from './labels.service.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: Label.name, schema: LabelSchema }])],
  controllers: [LabelsController],
  providers: [LabelsService],
  exports: [LabelsService],
})
export class LabelsModule {}
