import { Inject, Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import type { Rest, TokenRequest } from 'ably';
import { channels } from '@flowdesk/types';
import { ApiException } from '../common/http/api-exception.js';
import { MembershipsService } from '../modules/memberships/memberships.service.js';
import { ABLY_REST } from './ably.tokens.js';

/**
 * Builds the per-user Ably token. The capability object *is* the authorization
 * boundary for realtime: it lists exactly the channels the user may attach to —
 * their own user channel, the workspace channels of their active (non-client)
 * memberships, and the chat channels of their conversations.
 */
@Injectable()
export class RealtimeAuthService {
  constructor(
    @Inject(ABLY_REST) private readonly ably: Rest | null,
    @InjectConnection() private readonly connection: Connection,
    private readonly memberships: MembershipsService,
  ) {}

  get enabled(): boolean {
    return this.ably !== null;
  }

  async createTokenRequest(userId: string): Promise<TokenRequest> {
    if (!this.ably) throw new ApiException('service_unavailable', 'Realtime is not configured.');

    const [views, convos] = await Promise.all([
      this.memberships.listForUser(userId),
      this.connection
        .collection('conversations')
        .find({ memberUserIds: new Types.ObjectId(userId) }, { projection: { _id: 1 } })
        .toArray(),
    ]);

    const capability: Record<string, string[]> = {
      [channels.user(userId)]: ['subscribe'],
    };
    for (const v of views) {
      if (v.isClient) continue;
      capability[channels.workspace(v.workspaceId)] = ['subscribe', 'presence'];
    }
    for (const c of convos) {
      capability[channels.conversation(c._id.toString())] = ['subscribe', 'publish', 'presence'];
    }

    return this.ably.auth.createTokenRequest({
      clientId: userId,
      capability: JSON.stringify(capability),
      ttl: 60 * 60 * 1000,
    });
  }
}
