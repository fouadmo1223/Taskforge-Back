import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { configuration } from './config/configuration.js';
import { validateEnv } from './config/env.schema.js';
import { AllExceptionsFilter } from './common/http/all-exceptions.filter.js';
import { TransformInterceptor } from './common/http/transform.interceptor.js';
import { DatabaseModule } from './infra/database/database.module.js';
import { RedisModule } from './infra/redis/redis.module.js';
import { MailModule } from './infra/mail/mail.module.js';
import { CloudinaryModule } from './infra/cloudinary/cloudinary.module.js';
import { AblyModule } from './realtime/ably.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { RolesModule } from './modules/roles/roles.module.js';
import { MembershipsModule } from './modules/memberships/memberships.module.js';
import { TeamsModule } from './modules/teams/teams.module.js';
import { WorkspacesModule } from './modules/workspaces/workspaces.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { ActivityModule } from './modules/activity/activity.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { LabelsModule } from './modules/labels/labels.module.js';
import { ProjectsModule } from './modules/projects/projects.module.js';
import { BoardsModule } from './modules/boards/boards.module.js';
import { ColumnsModule } from './modules/columns/columns.module.js';
import { TasksModule } from './modules/tasks/tasks.module.js';
import { CommentsModule } from './modules/comments/comments.module.js';
import { AttachmentsModule } from './modules/attachments/attachments.module.js';
import { DependenciesModule } from './modules/dependencies/dependencies.module.js';
import { MilestonesModule } from './modules/milestones/milestones.module.js';
import { PlanningModule } from './modules/planning/planning.module.js';
import { MyWorkModule } from './modules/my-work/my-work.module.js';
import { SearchModule } from './modules/search/search.module.js';
import { TimeTrackingModule } from './modules/time-tracking/time-tracking.module.js';
import { TimesheetsModule } from './modules/timesheets/timesheets.module.js';
import { WorkloadModule } from './modules/workload/workload.module.js';
import { ChatModule } from './modules/chat/chat.module.js';
import { ClientsModule } from './modules/clients/clients.module.js';
import { ApprovalsModule } from './modules/approvals/approvals.module.js';
import { IntakeModule } from './modules/intake/intake.module.js';
import { DeliverablesModule } from './modules/deliverables/deliverables.module.js';
import { PortalModule } from './modules/portal/portal.module.js';
import { FinanceModule } from './modules/finance/finance.module.js';
import { GovernanceModule } from './modules/governance/governance.module.js';
import { ChangeRequestsModule } from './modules/change-requests/change-requests.module.js';
import { SlaModule } from './modules/sla/sla.module.js';
import { PortfoliosModule } from './modules/portfolios/portfolios.module.js';
import { GoalsModule } from './modules/goals/goals.module.js';
import { TemplatesModule } from './modules/templates/templates.module.js';
import { RecurringModule } from './modules/recurring/recurring.module.js';
import { WebhooksModule } from './modules/webhooks/webhooks.module.js';
import { ApiTokensModule } from './modules/api-tokens/api-tokens.module.js';
import { AutomationsModule } from './modules/automations/automations.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { DashboardsModule } from './modules/dashboards/dashboards.module.js';
import { SharingModule } from './modules/sharing/sharing.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validate: validateEnv,
    }),
    EventEmitterModule.forRoot({ wildcard: true, delimiter: '.', maxListeners: 20 }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
    }),

    // infra
    DatabaseModule,
    RedisModule,
    MailModule,
    CloudinaryModule,
    AblyModule,

    // cross-cutting
    AuditModule,
    ActivityModule,
    NotificationsModule,

    // domain — Phase 1
    HealthModule,
    UsersModule,
    RolesModule,
    MembershipsModule,
    TeamsModule,
    WorkspacesModule,
    AuthModule,

    // domain — Phase 2 (core work)
    LabelsModule,
    ProjectsModule,
    BoardsModule,
    ColumnsModule,
    TasksModule,
    CommentsModule,
    AttachmentsModule,

    // domain — Phase 3 (advanced PM)
    DependenciesModule,
    MilestonesModule,
    PlanningModule,
    MyWorkModule,
    SearchModule,

    // domain — Phase 4 (team operations)
    TimeTrackingModule,
    TimesheetsModule,
    WorkloadModule,

    // domain — Phase 5 (external workflow)
    ClientsModule,
    ApprovalsModule,
    IntakeModule,
    DeliverablesModule,
    PortalModule,

    // domain — Phase 6 (governance & finance)
    FinanceModule,
    GovernanceModule,
    ChangeRequestsModule,
    SlaModule,

    // domain — Phase 7 (strategy, automation, integrations)
    PortfoliosModule,
    GoalsModule,
    TemplatesModule,
    RecurringModule,
    WebhooksModule,
    ApiTokensModule,
    AutomationsModule,
    ReportsModule,
    DashboardsModule,
    SharingModule,

    // realtime chat
    ChatModule,

    // platform-wide admin dashboard
    AdminModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    },
  ],
})
export class AppModule {}
