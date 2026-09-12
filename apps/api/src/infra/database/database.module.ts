import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import type { AppConfig } from '../../config/configuration.js';

/**
 * Single Mongoose connection for the whole app. Fails fast (10s selection
 * timeout) with a clear log line so a bad `MONGODB_URI` or an Atlas IP-allowlist
 * miss is obvious at boot instead of hanging requests later.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const logger = new Logger('Mongoose');
        const uri = config.get('mongo.uri', { infer: true });
        return {
          uri,
          serverSelectionTimeoutMS: 10_000,
          autoIndex: config.get('env', { infer: true }) !== 'production',
          retryWrites: true,
          connectionFactory: (connection: { on: (e: string, cb: (...a: unknown[]) => void) => void }) => {
            connection.on('connected', () => logger.log('MongoDB connection established'));
            connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
            connection.on('error', (err: unknown) => logger.error(`MongoDB error: ${String(err)}`));
            return connection;
          },
        };
      },
    }),
  ],
})
export class DatabaseModule {}
