import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AppConfig } from '../../../config/configuration.js';
import type { RequestUser } from '../../../common/context/request-context.js';
import { UsersService } from '../../users/users.service.js';

interface AccessTokenPayload {
  sub: string;
  email: string;
  sid: string;
  epoch: number;
  type: 'access';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('jwt.accessSecret', { infer: true }),
    });
  }

  async validate(payload: AccessTokenPayload): Promise<RequestUser> {
    if (payload.type !== 'access') throw new UnauthorizedException('Wrong token type.');
    const user = await this.users.findById(payload.sub);
    if (!user || user.isSuspended) throw new UnauthorizedException('Account is not active.');
    if (user.tokenEpoch !== payload.epoch) throw new UnauthorizedException('Session is no longer valid.');
    return { id: user.id, email: user.email, sessionId: payload.sid };
  }
}
