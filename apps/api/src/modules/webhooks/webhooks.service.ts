import { createHmac, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { WebhookEvent } from '@flowdesk/types';
import { ApiException } from '../../common/http/api-exception.js';
import {
  Webhook,
  WebhookDelivery,
  type WebhookDeliveryDocument,
  type WebhookDocument,
} from './schemas/webhook.schema.js';

export interface WebhookView {
  id: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  lastStatus: number | null;
  lastDeliveryAt: string | null;
  failureCount: number;
  createdAt: string;
}

const DELIVERY_TIMEOUT_MS = 8000;

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger('WebhooksService');

  constructor(
    @InjectModel(Webhook.name) private readonly model: Model<WebhookDocument>,
    @InjectModel(WebhookDelivery.name) private readonly deliveries: Model<WebhookDeliveryDocument>,
  ) {}

  list(workspaceId: string): Promise<WebhookDocument[]> {
    return this.model.find({ workspaceId: new Types.ObjectId(workspaceId) }).sort({ createdAt: -1 }).exec();
  }

  async getOrThrow(workspaceId: string, id: string): Promise<WebhookDocument> {
    const doc = await this.model.findOne({ _id: id, workspaceId: new Types.ObjectId(workspaceId) }).exec();
    if (!doc) throw ApiException.notFound('Webhook');
    return doc;
  }

  async create(
    workspaceId: string,
    userId: string,
    input: { url: string; events: WebhookEvent[] },
  ): Promise<WebhookDocument> {
    if (!/^https?:\/\//i.test(input.url)) throw ApiException.validation('URL must be http(s).');
    return this.model.create({
      workspaceId: new Types.ObjectId(workspaceId),
      url: input.url.trim(),
      secret: `whsec_${randomBytes(24).toString('hex')}`,
      events: input.events,
      createdByUserId: new Types.ObjectId(userId),
    });
  }

  async update(
    workspaceId: string,
    id: string,
    patch: Partial<{ url: string; events: WebhookEvent[]; active: boolean }>,
  ): Promise<WebhookDocument> {
    const doc = await this.getOrThrow(workspaceId, id);
    if (patch.url !== undefined) {
      if (!/^https?:\/\//i.test(patch.url)) throw ApiException.validation('URL must be http(s).');
      doc.url = patch.url.trim();
    }
    if (patch.events !== undefined) doc.events = patch.events;
    if (patch.active !== undefined) doc.active = patch.active;
    await doc.save();
    return doc;
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const doc = await this.getOrThrow(workspaceId, id);
    await this.model.deleteOne({ _id: doc._id });
    await this.deliveries.deleteMany({ webhookId: doc._id });
  }

  recentDeliveries(webhookId: string): Promise<WebhookDeliveryDocument[]> {
    return this.deliveries.find({ webhookId: new Types.ObjectId(webhookId) }).sort({ createdAt: -1 }).limit(50).exec();
  }

  /** Reveal the signing secret (owner/admin only — enforced by the controller permission). */
  async revealSecret(workspaceId: string, id: string): Promise<string> {
    return (await this.getOrThrow(workspaceId, id)).secret;
  }

  /**
   * Fan a domain event out to every matching active webhook for a workspace.
   * Fire-and-forget: never blocks the caller, logs failures, records a delivery row.
   */
  dispatch(workspaceId: string, event: WebhookEvent, payload: Record<string, unknown>): void {
    void this.model
      .find({ workspaceId: new Types.ObjectId(workspaceId), active: true, events: event })
      .then((hooks) => Promise.all(hooks.map((h) => this.deliver(h, event, payload))))
      .catch((err) => this.logger.error(`dispatch(${event}) failed: ${String(err)}`));
  }

  async testDelivery(workspaceId: string, id: string): Promise<WebhookDeliveryDocument> {
    const hook = await this.getOrThrow(workspaceId, id);
    return this.deliver(hook, 'automation.executed', { test: true, at: new Date().toISOString() });
  }

  private async deliver(
    hook: WebhookDocument,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<WebhookDeliveryDocument> {
    const body = JSON.stringify({ event, at: new Date().toISOString(), workspaceId: hook.workspaceId.toString(), data: payload });
    const signature = createHmac('sha256', hook.secret).update(body).digest('hex');
    const started = Date.now();
    let status: number | null = null;
    let ok = false;
    let error = '';

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
      const res = await fetch(hook.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-flowdesk-event': event,
          'x-flowdesk-signature': `sha256=${signature}`,
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      status = res.status;
      ok = res.ok;
      if (!ok) error = `HTTP ${res.status}`;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const durationMs = Date.now() - started;
    await this.model.updateOne(
      { _id: hook._id },
      ok
        ? { $set: { lastStatus: status, lastDeliveryAt: new Date(), failureCount: 0 } }
        : { $set: { lastStatus: status, lastDeliveryAt: new Date() }, $inc: { failureCount: 1 } },
    );
    return this.deliveries.create({ webhookId: hook._id, event, status, ok, error, durationMs });
  }

  toView(h: WebhookDocument): WebhookView {
    return {
      id: h.id,
      url: h.url,
      events: h.events,
      active: h.active,
      lastStatus: h.lastStatus,
      lastDeliveryAt: h.lastDeliveryAt?.toISOString() ?? null,
      failureCount: h.failureCount,
      createdAt: h.createdAt.toISOString(),
    };
  }
}
