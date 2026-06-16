---
name: deploying-tarbie
description: How to deploy the Tarbie Сағаты monorepo to Cloudflare (Workers + Pages). Use when asked to deploy, push to Cloudflare, or ship the app.
---

# Deploying Tarbie to Cloudflare

Monorepo (pnpm workspaces) with two Workers and a React SPA served on two Pages projects.

| Component        | Path              | Cloudflare target                                  |
|------------------|-------------------|----------------------------------------------------|
| API Worker       | `apps/worker`     | `dprabota` → https://dprabota.bahtyarsanzhar.workers.dev |
| Bot Worker       | `apps/bot-worker` | `tarbie-bot` → https://tarbie-bot.bahtyarsanzhar.workers.dev |
| Frontend (SPA)   | `apps/web`        | Pages `tarbie-sagaty` and `tarbie-online`          |
| Custom domain    | —                 | https://tarbie.online (attached to a Pages project) |

Names/bindings live in `apps/worker/wrangler.toml` and `apps/bot-worker/wrangler.toml`
(D1 `tarbie-db`, KV, Queue `tarbie-notifications`). Don't change the IDs.

## Credentials
Wrangler reads `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from the environment
(saved as org secrets). Token needs: Workers Scripts, Cloudflare Pages, D1, Workers KV, Queues (Edit).

## Deploy steps (verified)
```bash
pnpm install
pnpm --filter @tarbie/shared build

# Workers — use each package's local wrangler v3 (apps/web has none)
cd apps/worker     && npx wrangler deploy
cd apps/bot-worker && npx wrangler deploy

# Frontend: build, then deploy to BOTH Pages projects.
# apps/web has no wrangler dep, so call the worker package's binary directly.
cd apps/web
# .env.production controls the API base (gitignored):
printf 'VITE_API_URL=https://dprabota.bahtyarsanzhar.workers.dev\nVITE_TELEGRAM_BOT_USERNAME=TarbieSagatyBot\n' > .env.production
pnpm build
../worker/node_modules/.bin/wrangler pages deploy dist --project-name=tarbie-sagaty --branch=main --commit-dirty=true
../worker/node_modules/.bin/wrangler pages deploy dist --project-name=tarbie-online --branch=main --commit-dirty=true
```

## Verify
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://dprabota.bahtyarsanzhar.workers.dev/   # 404 JSON = Hono up (root has no route)
curl -s -o /dev/null -w "%{http_code}\n" https://tarbie-sagaty.pages.dev/                # 200
curl -s -o /dev/null -w "%{http_code}\n" https://tarbie.online/                          # 200
```

## Secrets / migrations (not part of routine deploy)
Worker secrets (`JWT_SECRET`, `OTP_SECRET`, `TELEGRAM_BOT_TOKEN`, ...) are set once via
`wrangler secret put` (see SETUP.md). D1 migrations: `cd apps/worker && npx wrangler d1 migrations apply tarbie-db --remote`.
