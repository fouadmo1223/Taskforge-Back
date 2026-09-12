import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Ably from 'ably';
import { ABLY_REST } from './ably.tokens.js';
import type { AppConfig } from '../config/configuration.js';
import { MembershipsModule } from '../modules/memberships/memberships.module.js';
import { RealtimeAuthService } from './realtime-auth.service.js';
import { RealtimeController } from './realtime.controller.js';
import { RealtimeService } from './realtime.service.js';



/**
 * Managed realtime (Ably) instead of a Socket.IO gateway, so the API can run on
 * serverless. The server holds a REST client (stateless publish + token minting);
 * browsers hold a Realtime client authorised by a short-lived token this module
 * issues.
 */
@Global()
@Module({
  imports: [MembershipsModule],
  controllers: [RealtimeController],
  providers: [
    {
      provide: ABLY_REST,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const key = config.get('ably.apiKey', { infer: true });
        const logger = new Logger('Ably');
        if (!key) {
          logger.warn('ABLY_API_KEY not set — realtime events are disabled');
          return null;
        }
        logger.log('Ably REST client configured');
        return new Ably.Rest({ key });
      },
    },
    RealtimeService,
    RealtimeAuthService,
  ],
  exports: [RealtimeService, RealtimeAuthService],
})
export class AblyModule {}
