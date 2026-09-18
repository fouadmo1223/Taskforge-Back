import 'reflect-metadata';
import { Logger, type LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config/configuration.js';

const LOG_LEVELS: Record<AppConfig['logLevel'], LogLevel[]> = {
  error: ['error'],
  warn: ['error', 'warn'],
  log: ['error', 'warn', 'log'],
  debug: ['error', 'warn', 'log', 'debug'],
  verbose: ['error', 'warn', 'log', 'debug', 'verbose'],
};

/**
 * Builds and configures the Nest application without starting an HTTP listener.
 * Shared by the standalone server (`main.ts`) and the serverless handler
 * (`api/index.ts`).
 */
export async function createApp(): Promise<{ app: NestExpressApplication; config: ConfigService<AppConfig, true> }> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<AppConfig, true>);
  app.useLogger(LOG_LEVELS[config.get('logLevel', { infer: true })]);

  const http = config.get('http', { infer: true });
  const isProd = config.get('isProd', { infer: true });

  app.set('trust proxy', 1);
  app.use(cookieParser());
  app.use(
    helmet({
      contentSecurityPolicy: isProd ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.enableCors({
    origin: http.webOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });
  app.setGlobalPrefix(http.globalPrefix);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('FlowDesk API')
    .setDescription('Work-management platform API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addCookieAuth('fd_refresh')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${http.globalPrefix}/docs`, app, document, { swaggerOptions: { persistAuthorization: true } });

  return { app, config };
}
