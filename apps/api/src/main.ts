import { Logger } from '@nestjs/common';
import { createApp } from './create-app.js';

/** Standalone server for local dev and non-serverless hosts. */
async function bootstrap(): Promise<void> {
  const bootLogger = new Logger('Bootstrap');
  const { app, config } = await createApp();
  app.enableShutdownHooks();

  const http = config.get('http', { infer: true });
  await app.listen(http.port);
  bootLogger.log(`API listening on ${http.publicUrl} (prefix /${http.globalPrefix})`);
  if (!config.get('isProd', { infer: true })) {
    bootLogger.log(`Swagger UI at ${http.publicUrl}/${http.globalPrefix}/docs`);
  }
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
