import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Rest } from 'ably';
import { channels, type RealtimeEvent, type RealtimeMessage } from '@flowdesk/types';
import { ABLY_REST } from './ably.tokens.js';

/**
 * Publishes domain events to the managed pub/sub service (Ably) so realtime works
 * from stateless serverless functions. Channels are coarse — one per workspace,
 * one per user, one per chat conversation — and the browser filters by payload.
 * Authorization lives in {@link RealtimeAuthService} (token capability) and in the
 * feature guards that gate the mutation in the first place.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger('RealtimeService');

  constructor(@Inject(ABLY_REST) private readonly ably: Rest | null) {}

  private publish<T>(channel: string, event: RealtimeEvent, payload: T, actorId: string | null): void {
    if (!this.ably) return;
    const message: RealtimeMessage<T> = {
      event,
      room: channel,
      actorId,
      at: new Date().toISOString(),
      payload,
    };
    void this.ably.channels
      .get(channel)
      .publish(event, message)
      .catch((err: unknown) => this.logger.warn(`publish ${channel}/${event} failed: ${String(err)}`));
  }

  emitToWorkspace<T>(workspaceId: string, event: RealtimeEvent, payload: T, actorId: string | null = null): void {
    this.publish(channels.workspace(workspaceId), event, payload, actorId);
  }

  emitToUser<T>(userId: string, event: RealtimeEvent, payload: T, actorId: string | null = null): void {
    this.publish(channels.user(userId), event, payload, actorId);
  }

  emitToConversation<T>(conversationId: string, event: RealtimeEvent, payload: T, actorId: string | null = null): void {
    this.publish(channels.conversation(conversationId), event, payload, actorId);
  }

  /** Fan the same event to several users' personal channels. */
  emitToUsers<T>(userIds: string[], event: RealtimeEvent, payload: T, actorId: string | null = null): void {
    for (const id of new Set(userIds)) this.emitToUser(id, event, payload, actorId);
  }
}
