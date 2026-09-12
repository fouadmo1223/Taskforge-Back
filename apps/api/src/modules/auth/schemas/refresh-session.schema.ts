import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RefreshSessionDocument = HydratedDocument<RefreshSession>;

/**
 * One row per active login (token family). Refresh tokens rotate: each use
 * revokes the current row and writes a new one in the same `family`. Presenting
 * an already-rotated token (hash mismatch on a live family) is treated as theft —
 * the whole family is revoked.
 */
@Schema({ timestamps: true, collection: 'refresh_sessions' })
export class RefreshSession {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user!: Types.ObjectId;

  /** Stable id shared by every rotation of one login. */
  @Prop({ required: true, index: true })
  family!: string;

  /** sha256 of the currently-valid refresh token for this family. */
  @Prop({ required: true })
  tokenHash!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ type: Date, default: () => new Date() })
  lastUsedAt!: Date;

  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;

  @Prop({ type: String, default: null })
  revokedReason!: 'rotated' | 'logout' | 'logout_all' | 'reuse_detected' | 'password_changed' | null;

  @Prop({ type: String, default: null })
  userAgent!: string | null;

  @Prop({ type: String, default: null })
  ip!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const RefreshSessionSchema = SchemaFactory.createForClass(RefreshSession);

RefreshSessionSchema.index({ user: 1, revokedAt: 1 });
RefreshSessionSchema.index({ family: 1, revokedAt: 1 });
// TTL: purge rows a week after they expire.
RefreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });
