# I'm Live — live-stream-share-cast

Peer-to-peer live streaming on the edge: a React/Vite SPA in front of a single
Cloudflare Worker that owns auth, the database, storage, realtime chat and WebRTC
signalling. Media never touches the server — broadcaster and viewers exchange SDP
through a Durable Object and then stream directly to each other.

```
React + Vite (SPA)                 Cloudflare Worker (Hono)
──────────────                     ─────────────────────────────
pages / components  ── /api/* ──►  REST routes ──► D1   (schema + data)
integrations/api/client ── WS ──►  /api/ws/chat  ──► Durable Object (chat, presence)
services/*                        /api/ws/signal ──► Durable Object (offer/answer/ICE)
                                  R2 (recordings, avatars) · Cron (cleanup, rollups)
                                             ▲
                                             └── media flows peer-to-peer
```

* **Frontend:** React 18, Vite, TypeScript, Tailwind + shadcn/ui, React Query,
  Recharts.
* **Backend:** Cloudflare Workers (Hono), D1 (SQLite), R2, Durable Objects,
  Cron Triggers — see [`worker/README.md`](./worker/README.md).
* **Docs:** [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) (go-live checklist,
  every optional key) and [`docs/API.md`](./docs/API.md) (full endpoint list).

## What's implemented

| Area                | Highlights                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| Accounts            | signup, email verification, login with lockout, refresh rotation, password reset & change, sessions, personal API tokens, data export, account deletion (30-day grace) |
| Channels            | streamer mode, public profiles, follow graph, privacy settings, blocks, avatars                      |
| Broadcasting        | create/start/stop with heartbeats and stale-stream sweep, P2P WebRTC via TURN/STUN, scheduled broadcasts with reminders, stream keys for OBS-style ingest |
| Viewing             | browse + search + categories, live chat with moderation, presence, tips, replays/clips, continue watching |
| Creator tools       | dashboard analytics (watch minutes, unique viewers, followers, tips), VOD library with visibility & clip tools, earnings and donation link, schedule management |
| Moderation          | per-stream chat rules (followers-only, slow mode, word filter, min account age), timeouts/bans, reports, block list, audit trail |
| Admin console       | reports queue, bans, people search, integration readiness (which keys are missing), feature flags, client errors, audit log |
| Notifications       | in-app inbox with preferences, email outbox (Resend/Postmark/SendGrid/MailChannels/webhook), Web Push (VAPID + RFC 8291), unread bell |
| Integrations        | creator webhooks (8 events, HMAC-signed), product analytics, Sentry, captcha, Stripe or custom payment provider |
| Operations          | hourly cron (retention, stale streams, rollups, digest emails), health endpoint reporting pending configuration |

Everything above is code-complete; adding keys activates each integration
without touching the code (runtime config is served by `GET /api/config`).

## Running the full stack locally

Two processes: the Worker API on `:8787` and Vite on `:8080` (Vite proxies
`/api`, so WebSockets and cookies behave exactly like production).

```bash
# ── terminal 1 — API ─────────────────────────────────────────────
cd worker
npm ci
cp .dev.vars.example .dev.vars      # set JWT_SECRET (openssl rand -base64 48)
npm run db:migrate:local            # D1 schema (migrations 0001…0004)
npm run seed                        # optional demo data
npm run dev                         # http://127.0.0.1:8787

# ── terminal 2 — app ─────────────────────────────────────────────
npm ci
cp .env.example .env
npm run dev                         # http://localhost:8080
```

Demo accounts created by `npm run seed` (password `demo1234`):
`aria@demo.live`, `nova@demo.live`, `kai@demo.live`, `viewer@demo.live`.

Useful checks:

```bash
curl -s http://127.0.0.1:8080/api/health | jq      # services + pending keys
node worker/scripts/ws-test.mjs                    # realtime smoke test
curl -X POST http://127.0.0.1:8787/api/admin/cleanup \
     -H 'X-Cleanup-Token: dev-cleanup-token'       # run the cron path by hand
```

## Scripts

| Command                | Where  | What                                            |
| ---------------------- | ------ | ----------------------------------------------- |
| `npm run dev`          | root   | Vite dev server on `:8080` (proxies `/api`)      |
| `npm run dev:api`      | root   | the Worker API on `:8787`                        |
| `npm run build`        | root   | production SPA build → `dist/`                   |
| `npm run lint`         | root   | ESLint                                           |
| `npm run db:migrate`   | root   | apply migrations locally                         |
| `npm run seed`         | root   | seed demo data                                   |
| `npm run dev`          | worker | `wrangler dev` (D1/R2/DO simulated locally)      |
| `npm run typecheck`    | worker | `tsc --noEmit`                                   |
| `npm run db:migrate`   | worker | apply migrations to the remote D1 database       |
| `npm run deploy`       | worker | `wrangler deploy`                                |

## Deployment

Push to `main` and `.github/workflows/deploy-worker.yml` typechecks, applies D1
migrations and deploys the Worker (needs `CLOUDFLARE_API_TOKEN` +
`CLOUDFLARE_ACCOUNT_ID`). Build the SPA with `npm run build` and host `dist/`
on Pages/Vercel — details and the full secrets matrix are in
[`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md).

## Repository layout

```
src/
├── components/          UI (player, creator studio, chat overlay, settings panels…)
├── contexts/            auth + stream providers
├── hooks/               notifications, push, accent theme, analytics
├── integrations/api/    fetch/WebSocket client + DTO → domain mappers
├── lib/                 lanStream (WebRTC engine), telemetry, ambient audio
├── pages/               Index, Browse, WatchStream, CreateStream, Profile, Dashboard,
│                        Library, Schedule, Notifications, Moderation, Admin, Settings, auth
└── services/            one module per API area (streams, recordings, moderation, tips…)
worker/
├── migrations/          D1 schema (0001…0004)
├── src/
│   ├── durable/         ChatRoom, SignalRoom
│   ├── lib/             auth, config, email, push, webhook, payments, analytics, cleanup…
│   └── routes/          auth, users, streams, media, recordings, notifications,
│                        analytics, schedule, moderation, payments, integrations, admin
└── wrangler.jsonc       bindings, cron trigger, vars
docs/                    DEPLOYMENT.md, API.md
```
