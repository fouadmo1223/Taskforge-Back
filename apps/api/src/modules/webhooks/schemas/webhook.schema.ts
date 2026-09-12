import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { WEBHOOK_EVENTS, type WebhookEvent } from '@flowdesk/types';

export type WebhookDocument = HydratedDocument<Webhook>;

@Schema({ timestamps: true, collection: 'webhooks' })
export class Webhook {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 2000 })
  url!: string;

  /** used to sign the `X-FlowDesk-Signature` header (HMAC-SHA256) */
  @Prop({ required: true })
  secret!: string;

  @Prop({ type: [String], enum: WEBHOOK_EVENTS, default: [] })
  events!: WebhookEvent[];

  @Prop({ default: true, index: true })
  active!: boolean;

  @Prop({ type: Number, default: null })
  lastStatus!: number | null;

  @Prop({ type: Date, default: null })
  lastDeliveryAt!: Date | null;

  @Prop({ default: 0 })
  failureCount!: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdByUserId!: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}
export const WebhookSchema = SchemaFactory.createForClass(Webhook);

export type WebhookDeliveryDocument = HydratedDocument<WebhookDelivery>;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'webhook_deliveries' })
export class WebhookDelivery {
  @Prop({ type: Types.ObjectId, ref: 'Webhook', required: true, index: true })
  webhookId!: Types.ObjectId;

  @Prop({ required: true })
  event!: string;

  @Prop({ type: Number, default: null })
  status!: number | null;

  @Prop({ default: false })
  ok!: boolean;

  @Prop({ default: '', maxlength: 2000 })
  error!: string;

  @Prop({ type: Number, default: 0 })
  durationMs!: number;

  createdAt!: Date;
}
export const WebhookDeliverySchema = SchemaFactory.createForClass(WebhookDelivery);
WebhookDeliverySchema.index({ webhookId: 1, createdAt: -1 });
