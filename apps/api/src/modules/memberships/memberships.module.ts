import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RolesModule } from '../roles/roles.module.js';
import { UsersModule } from '../users/users.module.js';
import { InvitesController } from './invites.controller.js';
import { MembershipsController } from './memberships.controller.js';
import { MembershipsService } from './memberships.service.js';
import { WorkspaceMembership, WorkspaceMembershipSchema } from './schemas/workspace-membership.schema.js';

/**
 * Global because the tenancy guards (`WorkspaceGuard`) resolve membership context
 * for every feature module. Feature modules do not import this — they just use
 * the guards.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: WorkspaceMembership.name, schema: WorkspaceMembershipSchema }]),
    RolesModule,
    UsersModule,
  ],
  controllers: [MembershipsController, InvitesController],
  providers: [MembershipsService],
  exports: [MembershipsService],
})
export class MembershipsModule {}
