import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as argon2 from 'argon2';
import type { AuthUser, Locale, ThemePreference } from '@flowdesk/types';
import { ApiException } from '../../common/http/api-exception.js';
import { CloudinaryService } from '../../infra/cloudinary/cloudinary.service.js';
import { User, type UserDocument } from './schemas/user.schema.js';

interface MulterFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

const ARGON_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly model: Model<UserDocument>,
    private readonly cloudinary: CloudinaryService,
  ) {}

  hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON_OPTS);
  }

  verifyPassword(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain).catch(() => false);
  }

  async createLocal(input: { name: string; email: string; password: string; locale?: Locale }): Promise<UserDocument> {
    const email = input.email.toLowerCase().trim();
    const existing = await this.model.exists({ email });
    if (existing) throw ApiException.conflict('An account with that email already exists.');
    const passwordHash = await this.hashPassword(input.password);
    return this.model.create({
      name: input.name.trim(),
      email,
      passwordHash,
      locale: input.locale ?? 'en',
    });
  }

  findById(id: string | Types.ObjectId): Promise<UserDocument | null> {
    return this.model.findById(id).exec();
  }

  findByIdWithSecret(id: string | Types.ObjectId): Promise<UserDocument | null> {
    return this.model.findById(id).select('+passwordHash').exec();
  }

  findByEmail(email: string, withSecret = false): Promise<UserDocument | null> {
    const q = this.model.findOne({ email: email.toLowerCase().trim() });
    return (withSecret ? q.select('+passwordHash') : q).exec();
  }

  async getByIdOrThrow(id: string): Promise<UserDocument> {
    const user = await this.findById(id);
    if (!user) throw ApiException.notFound('User');
    return user;
  }

  async markEmailVerified(id: string | Types.ObjectId): Promise<void> {
    await this.model.updateOne({ _id: id }, { $set: { emailVerified: true } }).exec();
  }

  async setPassword(id: string | Types.ObjectId, plain: string): Promise<void> {
    const passwordHash = await this.hashPassword(plain);
    await this.model.updateOne({ _id: id }, { $set: { passwordHash }, $inc: { tokenEpoch: 1 } }).exec();
  }

  async recordLogin(id: string | Types.ObjectId): Promise<void> {
    await this.model.updateOne({ _id: id }, { $set: { lastLoginAt: new Date() } }).exec();
  }

  async bumpTokenEpoch(id: string | Types.ObjectId): Promise<void> {
    await this.model.updateOne({ _id: id }, { $inc: { tokenEpoch: 1 } }).exec();
  }

  async updateProfile(
    id: string,
    patch: Partial<{ name: string; locale: Locale; theme: ThemePreference; timezone: string | null }>,
  ): Promise<UserDocument> {
    const user = await this.model.findByIdAndUpdate(id, { $set: patch }, { new: true }).exec();
    if (!user) throw ApiException.notFound('User');
    return user;
  }

  async setAvatar(id: string, file: MulterFile): Promise<UserDocument> {
    const user = await this.model.findById(id).exec();
    if (!user) throw ApiException.notFound('User');
    const asset = await this.cloudinary.upload({
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
      size: file.size,
      uploaderUserId: id,
      folder: 'avatars',
    });
    if (asset.resourceType !== 'image') throw ApiException.validation('Avatar must be an image.');
    const previous = user.avatar;
    user.avatar = asset;
    await user.save();
    if (previous) await this.cloudinary.destroy(previous.publicId, previous.resourceType);
    return user;
  }

  async removeAvatar(id: string): Promise<UserDocument> {
    const user = await this.model.findById(id).exec();
    if (!user) throw ApiException.notFound('User');
    if (user.avatar) {
      await this.cloudinary.destroy(user.avatar.publicId, user.avatar.resourceType);
      user.avatar = null;
      await user.save();
    }
    return user;
  }

  toAuthUser(user: UserDocument): AuthUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      avatar: user.avatar,
      locale: user.locale,
      theme: user.theme,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
