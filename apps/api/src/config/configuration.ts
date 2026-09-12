import { envSchema } from './env.schema.js';

/**
 * Shapes validated env into a nested, strongly-typed config tree consumed via
 * `ConfigService<AppConfig, true>`. Register with
 * `ConfigModule.forRoot({ load: [configuration], validate: validateEnv })`.
 *
 * Re-parses `process.env` through the same schema so transformed values
 * (`WEB_ORIGIN` -> string[], boolean coercions) are applied here too.
 */
export function configuration(): AppConfig {
  const env = envSchema.parse(process.env);
  return {
    env: env.NODE_ENV,
    isProd: env.NODE_ENV === 'production',
    logLevel: env.LOG_LEVEL,
    http: {
      port: env.API_PORT,
      globalPrefix: env.API_GLOBAL_PREFIX,
      webOrigin: env.WEB_ORIGIN,
      publicUrl: env.API_PUBLIC_URL,
    },
    mongo: { uri: env.MONGODB_URI },
    redis: { url: env.REDIS_URL },
    ably: { apiKey: env.ABLY_API_KEY },
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET,
      accessTtl: env.JWT_ACCESS_TTL,
      refreshSecret: env.JWT_REFRESH_SECRET,
      refreshTtl: env.JWT_REFRESH_TTL,
      cookieDomain: env.AUTH_COOKIE_DOMAIN,
      cookieSecure: env.AUTH_COOKIE_SECURE,
      cookieSameSite: env.AUTH_COOKIE_SAMESITE,
    },
    mail: {
      transport: env.MAIL_TRANSPORT,
      from: env.MAIL_FROM,
      smtp: {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    },
    cloudinary: {
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      apiKey: env.CLOUDINARY_API_KEY,
      apiSecret: env.CLOUDINARY_API_SECRET,
      folder: env.CLOUDINARY_UPLOAD_FOLDER,
      enabled: Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET),
    },
    rateLimit: { ttl: env.RATE_LIMIT_TTL, limit: env.RATE_LIMIT_LIMIT },
  };
}

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  isProd: boolean;
  logLevel: 'error' | 'warn' | 'log' | 'debug' | 'verbose';
  http: {
    port: number;
    globalPrefix: string;
    webOrigin: string[];
    publicUrl: string;
  };
  mongo: { uri: string };
  redis: { url: string };
  ably: { apiKey?: string };
  jwt: {
    accessSecret: string;
    accessTtl: number;
    refreshSecret: string;
    refreshTtl: number;
    cookieDomain: string;
    cookieSecure: boolean;
    cookieSameSite: 'lax' | 'none' | 'strict';
  };
  mail: {
    transport: 'console' | 'smtp';
    from: string;
    smtp: { host?: string; port?: number; user?: string; pass?: string };
  };
  cloudinary: {
    cloudName?: string;
    apiKey?: string;
    apiSecret?: string;
    folder: string;
    enabled: boolean;
  };
  rateLimit: { ttl: number; limit: number };
}
