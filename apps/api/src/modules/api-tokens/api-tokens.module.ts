import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Project, ProjectSchema } from '../projects/schemas/project.schema.js';
import { Task, TaskSchema } from '../tasks/schemas/task.schema.js';
import { ApiToken, ApiTokenSchema } from './schemas/api-token.schema.js';
import { ApiTokensController } from './api-tokens.controller.js';
import { ExternalApiController } from './external-api.controller.js';
import { ApiTokensService } from './api-tokens.service.js';
import { ApiTokenGuard } from './api-token.guard.js';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ApiToken.name, schema: ApiTokenSchema },
      { name: Project.name, schema: ProjectSchema },
      { name: Task.name, schema: TaskSchema },
    ]),
  ],
  controllers: [ApiTokensController, ExternalApiController],
  providers: [ApiTokensService, ApiTokenGuard],
  exports: [ApiTokensService],
})
export class ApiTokensModule {}
