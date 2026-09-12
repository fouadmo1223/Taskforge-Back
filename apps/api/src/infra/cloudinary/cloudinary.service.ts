import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import type { CloudinaryAsset } from '@flowdesk/types';
import type { AppConfig } from '../../config/configuration.js';
import { ApiException } from '../../common/http/api-exception.js';

const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);
const DOC_MIME = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const MAX_BYTES = 15 * 1024 * 1024;

export interface UploadInput {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
  uploaderUserId: string;
  folder: string;
}

@Injectable()
export class CloudinaryService implements OnModuleInit {
  private readonly logger = new Logger('Cloudinary');
  private enabled = false;
  private baseFolder = 'flowdesk';

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  onModuleInit(): void {
    const c = this.config.get('cloudinary', { infer: true });
    this.enabled = c.enabled;
    this.baseFolder = c.folder;
    if (this.enabled) {
      cloudinary.config({ cloud_name: c.cloudName, api_key: c.apiKey, api_secret: c.apiSecret, secure: true });
      this.logger.log(`configured for cloud "${c.cloudName ?? ''}"`);
    } else {
      this.logger.warn('CLOUDINARY_* not fully set — media upload is disabled');
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  validate(mimetype: string, size: number): 'image' | 'raw' {
    if (size > MAX_BYTES) throw new ApiException('payload_too_large', 'Files must be 15 MB or smaller.');
    if (IMAGE_MIME.has(mimetype)) return 'image';
    if (DOC_MIME.has(mimetype)) return 'raw';
    throw ApiException.validation('That file type is not allowed.');
  }

  async upload(input: UploadInput): Promise<CloudinaryAsset> {
    if (!this.enabled) throw new ApiException('service_unavailable', 'Media storage is not configured.');
    const resourceType = this.validate(input.mimetype, input.size);

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `${this.baseFolder}/${input.folder}`,
          resource_type: resourceType === 'image' ? 'image' : 'raw',
          use_filename: true,
          unique_filename: true,
          overwrite: false,
        },
        (err, res) => (err || !res ? reject(err ?? new Error('upload failed')) : resolve(res)),
      );
      stream.end(input.buffer);
    }).catch((err: unknown) => {
      this.logger.error(`upload failed: ${String(err)}`);
      throw new ApiException('service_unavailable', 'Upload failed. Please try again.');
    });

    return {
      publicId: result.public_id,
      secureUrl: result.secure_url,
      resourceType: result.resource_type === 'video' ? 'video' : result.resource_type === 'image' ? 'image' : 'raw',
      format: result.format ?? input.originalname.split('.').pop() ?? '',
      bytes: result.bytes,
      width: result.width ?? null,
      height: result.height ?? null,
      originalFilename: input.originalname,
      uploadedBy: input.uploaderUserId,
      createdAt: new Date().toISOString(),
    };
  }

  async destroy(publicId: string, resourceType: 'image' | 'raw' | 'video' = 'image'): Promise<void> {
    if (!this.enabled) return;
    await cloudinary.uploader
      .destroy(publicId, { resource_type: resourceType })
      .catch((err: unknown) => this.logger.warn(`destroy ${publicId} failed: ${String(err)}`));
  }
}
