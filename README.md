# Taskforge — Backend

NestJS 11 + MongoDB (Mongoose) + Redis + Ably realtime.

Split out of the original Taskforge monorepo. Still a small pnpm workspace under the hood
because the API imports two shared packages:

```
apps/
  api/            the API itself
packages/
  types/          shared TS types (permission catalog, enums, realtime events, API envelopes)
  utils/          pure helpers used by the API (lexorank, graph cycle detection, text)
  config/         shared ESLint / tsconfig presets
```

## Prerequisites

- Node.js 20.11+
- pnpm 10+ (`corepack enable`)
- Redis 7+ — via Docker (`pnpm infra:up`) or a local install
- MongoDB 8+ — Atlas or local

## Local development

```bash
pnpm install
pnpm infra:up                    # docker compose up -d redis
cp .env.example apps/api/.env    # fill in MONGODB_URI, JWT secrets, etc.
pnpm --filter @flowdesk/api seed # optional demo workspace + owner login
pnpm dev                         # → http://localhost:4000/api/v1
```

Swagger: `http://localhost:4000/api/v1/docs`

## Deploying

This is a standard NestJS app (`pnpm build` → `dist/main.js`, run with `pnpm start`). Deploy it
anywhere that runs a long-lived Node process (Render, Railway, Fly.io, a VM, etc.) — NestJS here
is not built for a serverless/edge target, so it isn't a fit for Vercel the way the frontend is.
Set `WEB_ORIGIN` to your deployed frontend's origin (CORS) and `API_PUBLIC_URL` to this API's own
public URL.

## Scripts

| Command | What |
| --- | --- |
| `pnpm dev` | Nest in watch mode |
| `pnpm build` | production build (`dist/`) |
| `pnpm start` | run the built server |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest |
| `pnpm seed` | seed a demo workspace |

## Origin

This is a split of the backend half of the original Taskforge monorepo (paired with a separate
`Taskforge-Front` repo for the React app). It carries a fresh git history starting from that
split.
