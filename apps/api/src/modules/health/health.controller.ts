import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Connection } from 'mongoose';
import type { Redis } from 'ioredis';
import { Public } from '../../common/decorators/public.decorator.js';
import { RawResponse } from '../../common/decorators/raw-response.decorator.js';
import { REDIS_CLIENT } from '../../infra/redis/redis.module.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly mongo: Connection,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  @Public()
  @RawResponse()
  @ApiOperation({ summary: 'Liveness / readiness probe' })
  async check(): Promise<{
    status: 'ok' | 'degraded';
    mongo: 'up' | 'down';
    redis: 'up' | 'down';
    uptime: number;
  }> {
    const mongoUp = this.mongo.readyState === 1;
    let redisUp = false;
    try {
      redisUp = (await this.redis.ping()) === 'PONG';
    } catch {
      redisUp = false;
    }
    return {
      status: mongoUp && redisUp ? 'ok' : 'degraded',
      mongo: mongoUp ? 'up' : 'down',
      redis: redisUp ? 'up' : 'down',
      uptime: Math.round(process.uptime()),
    };
  }
}
