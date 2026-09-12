import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TasksModule } from '../tasks/tasks.module.js';
import { Form, FormSchema, FormSubmission, FormSubmissionSchema } from './schemas/form.schema.js';
import { Request, RequestSchema } from './schemas/request.schema.js';
import { FormsService } from './forms.service.js';
import { RequestsService } from './requests.service.js';
import { FormsController } from './forms.controller.js';
import { RequestsController } from './requests.controller.js';
import { PublicFormsController } from './public-forms.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Form.name, schema: FormSchema },
      { name: FormSubmission.name, schema: FormSubmissionSchema },
      { name: Request.name, schema: RequestSchema },
    ]),
    TasksModule,
  ],
  controllers: [FormsController, RequestsController, PublicFormsController],
  providers: [FormsService, RequestsService],
  exports: [FormsService, RequestsService, MongooseModule],
})
export class IntakeModule {}
