import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Express } from 'express';
import { createApp } from '../src/create-app.js';

/**
 * Vercel serverless entrypoint. The Nest app + its Mongo connection are created
 * once per warm container and reused across invocations. `vercel.json` routes
 * every path to this function.
 */
let cached: Express | null = null;

async function getHandler(): Promise<Express> {
  if (cached) return cached;
  const { app } = await createApp();
  await app.init();
  cached = app.getHttpAdapter().getInstance() as Express;
  return cached;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const expressApp = await getHandler();
  expressApp(req as never, res as never);
}
