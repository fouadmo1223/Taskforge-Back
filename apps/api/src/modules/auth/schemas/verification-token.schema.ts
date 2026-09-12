import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type VerificationTokenDocument = HydratedDocument<VerificationToken>;

export type VerificationPurpose = 'email_verify' | 'password_reset';

/** Single-use, hashed, short-lived tokens for email verification and password reset. */
@Schema({ timestamps: true, collection: 'verification_tokens' })
export class VerificationToken {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ['email_verify', 'password_reset'] })
  purpose!: VerificationPurpose;

  /** sha256 of the raw token that was emailed. */
  @Prop({ required: true, index: true })
  tokenHash!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  consumedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const VerificationTokenSchema = SchemaFactory.createForClass(VerificationToken);

VerificationTokenSchema.index({ user: 1, purpose: 1, consumedAt: 1 });
VerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });
