import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { MembershipsModule } from '../memberships/memberships.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RefreshSession, RefreshSessionSchema } from './schemas/refresh-session.schema.js';
import { VerificationToken, VerificationTokenSchema } from './schemas/verification-token.schema.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

@Module({
  imports: [
    UsersModule,
    MembershipsModule,
    PassportModule,
    JwtModule.register({}),
    MongooseModule.forFeature([
      { name: RefreshSession.name, schema: RefreshSessionSchema },
      { name: VerificationToken.name, schema: VerificationTokenSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    // Global auth: every route requires a valid access token unless @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
