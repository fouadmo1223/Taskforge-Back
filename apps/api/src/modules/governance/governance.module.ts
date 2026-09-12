import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProjectsModule } from '../projects/projects.module.js';
import {
  Decision,
  DecisionSchema,
  Issue,
  IssueSchema,
  Risk,
  RiskSchema,
} from './schemas/raid.schema.js';
import { GovernanceController } from './governance.controller.js';
import { GovernanceService } from './governance.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Risk.name, schema: RiskSchema },
      { name: Issue.name, schema: IssueSchema },
      { name: Decision.name, schema: DecisionSchema },
    ]),
    ProjectsModule,
  ],
  controllers: [GovernanceController],
  providers: [GovernanceService],
  exports: [GovernanceService],
})
export class GovernanceModule {}
