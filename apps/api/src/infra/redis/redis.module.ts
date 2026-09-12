import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { AppConfig } from '../../config/configuration.js';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * Shared Redis client for the short-lived membership-context cache and (later) a
 * distributed rate-limit store. Not on the request hot path — every read/write
 * is wrapped so a Redis outage degrades to a direct DB lookup rather than an
 * error. Reachable from serverless (plain TCP to a managed Redis).
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const logger = new Logger('Redis');
        const client = new Redis(config.get('redis.url', { infer: true }), {
          maxRetriesPerRequest: 2,
          enableReadyCheck: true,
          lazyConnect: false,
          retryStrategy: (times) => Math.min(times * 200, 3000),
        });
        client.on('ready', () => logger.log('ready'));
        client.on('error', (err) => logger.warn(err.message));
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.quit().catch(() => undefined);
  }
}
