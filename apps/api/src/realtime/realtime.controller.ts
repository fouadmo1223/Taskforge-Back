import { Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TokenRequest } from 'ably';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RawResponse } from '../common/decorators/raw-response.decorator.js';
import { RealtimeAuthService } from './realtime-auth.service.js';

@ApiTags('realtime')
@ApiBearerAuth()
@Controller('realtime')
export class RealtimeController {
  constructor(private readonly auth: RealtimeAuthService) {}

  @Post('token')
  @RawResponse()
  @ApiOperation({ summary: 'Mint a short-lived Ably token scoped to the caller’s channels' })
  token(@CurrentUser('id') userId: string): Promise<TokenRequest> {
    return this.auth.createTokenRequest(userId);
  }
}
