import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { CloudinaryAsset, Locale, ThemePreference } from '@flowdesk/types';
import { CloudinaryAssetSchema } from '../../../common/db/cloudinary-asset.schema.js';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, trim: true, maxlength: 120 })
  name!: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true })
  email!: string;

  /** Argon2id hash. Never selected by default. */
  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({ default: false })
  emailVerified!: boolean;

  @Prop({ type: CloudinaryAssetSchema, default: null })
  avatar!: CloudinaryAsset | null;

  @Prop({ type: String, enum: ['en', 'ar'], default: 'en' })
  locale!: Locale;

  @Prop({ type: String, enum: ['light', 'dark', 'system'], default: 'system' })
  theme!: ThemePreference;

  @Prop({ type: String, default: null })
  timezone!: string | null;

  @Prop({ type: Date, default: null })
  lastLoginAt!: Date | null;

  /** true = account banned by a platform admin, or self-suspended by security flow */
  @Prop({ default: false })
  isSuspended!: boolean;

  /** Bumped on "log out everywhere" / password change to invalidate all sessions. */
  @Prop({ default: 0 })
  tokenEpoch!: number;

  /**
   * Platform-wide superuser flag — distinct from any per-workspace role (including the
   * 'admin' workspace role preset, which only grants permissions inside one workspace).
   * Never settable from any user-facing endpoint; only flipped directly in the database
   * to bootstrap the first admin, or by an existing platform admin via the admin API.
   */
  @Prop({ default: false })
  isPlatformAdmin!: boolean;

  @Prop({ type: Date, default: null })
  bannedAt!: Date | null;

  @Prop({ type: String, default: null })
  banReason!: string | null;

  /** Set when emailVerified is flipped by an admin rather than the user's own verify link. */
  @Prop({ type: Date, default: null })
  verifiedByAdminAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    const r = ret as unknown as Record<string, unknown>;
    r.id = String(r._id);
    delete r._id;
    delete r.passwordHash;
    return r;
  },
});
