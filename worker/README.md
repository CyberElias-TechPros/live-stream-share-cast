# Backend — Cloudflare Workers

The API that powers **I'm Live** (live-stream-share-cast). It replaces the old
Supabase backend with a single Cloudflare Worker:

| Concern             | Supabase (before)                | Cloudflare (now)                        |
| ------------------- | -------------------------------- | --------------------------------------- |
| Database            | Postgres (`profiles`, `streams`) | **D1** (SQLite at the edge)             |
| Auth                | Supabase Auth (GoTrue)           | **first-party JWT** (PBKDF2 + HMAC)     |
| Realtime chat       | `postgres_changes`               | **Durable Object** (`ChatRoom`)         |
| WebRTC signalling   | Realtime broadcast channels      | **Durable Object** (`SignalRoom`)       |
| Recordings / avatars| Storage buckets                  | **R2**                                  |
| Realtime presence   | —                                | **Durable Object** (socket count)       |
| Cron cleanup        | `pg_cron` + `net.http_post`      | **Cron Triggers** (`scheduled()`)       |

```
                 ┌──────────────────────── Cloudflare ────────────────────────┐
  React (Vite)   │                                                            │
  ──────────────►│  Worker (Hono)  ──►  D1  (users, streams, chat, sessions)  │
   REST /api/*   │       │         ──►  R2  (recordings, avatars)             │
   WS   /api/ws/*│       └────────►  DO  ChatRoom   (chat + presence)         │
                 │                  DO  SignalRoom (WebRTC offer/answer)      │
                 └────────────────────────────────────────────────────────────┘
                                    │
                          media flows peer-to-peer (WebRTC),
                          never through the Worker
```

---

## Quick start (local)

```bash
cd worker
npm install
cp .dev.vars.example .dev.vars     # then edit JWT_SECRET

npm run db:migrate:local           # create the D1 schema locally
npm run dev                        # http://127.0.0.1:8787  (D1/R2/DO are simulated)
npm run seed                       # optional: demo users, streams and chat
```

Then, from the repo root:

```bash
npm install
cp .env.example .env
npm run dev                        # Vite on :8080, proxies /api → :8787
```

Open <http://localhost:8080>. Health check: <http://127.0.0.1:8787/api/health>.

---

## API

All routes are mounted under `/api`. Errors use
`{ "error": string, "code"?: string, "details"?: unknown }`.

### Auth — `/api/auth`

| Method | Path                 | Auth | Notes                                                     |
| ------ | -------------------- | ---- | --------------------------------------------------------- |
| POST   | `/signup`            | –    | `{username,email,password,displayName?}` → tokens + user   |
| POST   | `/login`             | –    | `{email,password}` → tokens + user                         |
| POST   | `/refresh`           | –    | `{refreshToken}` → rotated pair                            |
| POST   | `/logout`            | ✅   | revokes the current session                                |
| GET    | `/me`                | ✅   | private profile (email, preferences, social links)         |
| GET    | `/sessions`          | ✅   | active sessions                                            |
| DELETE | `/sessions`          | ✅   | sign out everywhere                                        |
| POST   | `/forgot-password`   | –    | returns a reset link; **outside production** also `devToken`|
| POST   | `/reset-password`    | –    | `{token,password}`                                         |

Access tokens are HS256 JWTs (1 h); refresh tokens are 48-byte random strings
stored **hashed** in D1 (30 d, rotated on every use). Passwords use
PBKDF2-SHA256 (`120_000` iterations, per-user salt).

> **Email is not wired up.** `forgot-password` logs the link and returns it in
> the response when `ENVIRONMENT !== "production"`. Plug in Resend/Postmark/SES
> at the marked TODO in `src/routes/auth.ts` before going live.

### Users — `/api/users`, `/api/profiles`

| Method | Path                      | Auth | Notes                                    |
| ------ | ------------------------- | ---- | ---------------------------------------- |
| GET    | `/users/me`               | ✅   | own (private) profile                    |
| PATCH  | `/users/me`               | ✅   | username, displayName, bio, avatar, …    |
| PATCH  | `/users/me/preferences`   | ✅   | deep-merged with the defaults            |
| POST   | `/users/me/streamer`      | ✅   | `{isStreamer}`                           |
| POST   | `/users/me/avatar`        | ✅   | multipart `file` → R2 + profile update   |
| GET    | `/users/me/streams`       | ✅   | own streams (**includes stream keys**)   |
| GET    | `/users/me/sessions`      | ✅   | past broadcast sessions                  |
| GET    | `/users/:id`              | –    | public profile                           |
| GET    | `/users/:id/streams`      | –    | that user's streams                      |
| GET    | `/users/:id/followers`    | –    |                                          |
| GET    | `/users/:id/following`    | –    |                                          |
| GET    | `/users/:id/follow`       | ✅   | `{isFollowing}`                          |
| PUT    | `/users/:id/follow`       | ✅   | follow (idempotent)                      |
| DELETE | `/users/:id/follow`       | ✅   | unfollow                                 |
| GET    | `/profiles/:username`     | –    | public profile by handle                 |

### Streams — `/api/streams`

| Method | Path                       | Auth | Notes                                             |
| ------ | -------------------------- | ---- | ------------------------------------------------- |
| GET    | `/`                        | –    | `?live&category&search&userId&sort&limit&offset`   |
| POST   | `/`                        | ✅   | creates a stream (key generated server-side)       |
| GET    | `/keys/generate`           | ✅   | streamer-only key minting (OBS-style ingest)       |
| GET    | `/:id`                     | –    | key is only returned to the owner                  |
| PATCH  | `/:id`                     | ✅   | owner only                                         |
| DELETE | `/:id`                     | ✅   | owner only (also deletes the R2 recording)         |
| POST   | `/:id/start`               | ✅   | goes live, opens a `stream_sessions` row           |
| POST   | `/:id/stop`                | ✅   | ends the broadcast, closes the session             |
| POST   | `/:id/heartbeat`           | ✅   | keeps the stream live, `{viewerCount}`             |
| POST   | `/:id/viewers`             | –    | viewer bookkeeping for non-socket clients          |
| POST   | `/:id/stats`               | ✅   | telemetry sample (bandwidth, CPU, memory, errors)  |
| GET    | `/:id/stats`               | –    |                                                     |
| GET    | `/:id/sessions`            | –    |                                                     |
| GET    | `/:id/presence`            | –    | live `{viewers, hostConnected, live}` from the DO   |
| GET    | `/:id/chat`                | –    | `?limit&before`                                     |
| POST   | `/:id/chat`                | ✅   | post + fan out through the Durable Object          |
| PATCH  | `/:id/chat/:messageId`     | ✅   | owner: hide/restore a message                      |

### Media — `/api/media`

| Method | Path                | Auth | Notes                                             |
| ------ | ------------------- | ---- | ------------------------------------------------- |
| POST   | `/recordings`       | ✅   | multipart `file` (+ `streamId`, `retentionHours`)  |
| GET    | `/recordings/*`     | –    | R2 object, supports `Range` (video scrubbing)      |
| DELETE | `/recordings/*`     | ✅   | owner only                                         |
| GET    | `/avatars/*`        | –    | immutable cache headers                            |

### Realtime — `/api/ws`

| Path                                   | Query                                | Purpose                    |
| -------------------------------------- | ------------------------------------ | -------------------------- |
| `/api/ws/chat/:streamId`               | `role=host\|viewer`, `token`         | chat, presence, moderation |
| `/api/ws/signal/:streamId`             | `role`, `peerId`, `token`            | WebRTC offer/answer/ICE    |

`role=host` requires a valid token **and** stream ownership.

### Admin — `/api/admin`

| Method | Path                        | Auth                          |
| ------ | --------------------------- | ----------------------------- |
| POST   | `/cleanup`                  | `X-Cleanup-Token` header      |
| POST   | `/cleanup/recordings`       | user session (own recordings) |

---

## Scheduled cleanup

`triggers.crons = ["0 * * * *"]` runs `runCleanup()` hourly
(`src/lib/cleanup.ts`):

1. delete expired recordings from R2 and clear the DB columns
2. force streams offline when the host has not heartbeated for
   `STALE_STREAM_MINUTES` (5 by default)
3. close `stream_sessions` rows stuck open for > 12 h
4. purge expired auth sessions and password-reset tokens
5. drop `stream_stats` older than 30 days

Test it locally:

```bash
curl -X POST http://127.0.0.1:8787/api/admin/cleanup -H 'X-Cleanup-Token: dev-cleanup-token'
# or simulate the cron trigger
curl "http://127.0.0.1:8787/__scheduled?cron=0+*+*+*+*"
```

---

## WebRTC / media

Media never touches the Worker: the broadcaster and each viewer exchange SDP
and ICE candidates through `SignalRoom`, then stream peer-to-peer.

* Same LAN / simple NAT → works with the bundled public STUN.
* Symmetric NAT / mobile networks → **you need TURN**. Set `iceServers` in
  `src/lib/lanStream.ts` (`ICE_CONFIG`) to a hosted TURN service
  (Cloudflare Calls, Metered, Twilio…). Without TURN, roughly 10–20 % of
  viewer connections will fail.

---

## Deploy

```bash
cd worker

# 1 — resources
npx wrangler login
npx wrangler d1 create live-stream-db        # paste database_id into wrangler.jsonc
npx wrangler r2 bucket create lsc-recordings
npx wrangler r2 bucket create lsc-avatars

# 2 — secrets
npx wrangler secret put JWT_SECRET           # openssl rand -base64 48
npx wrangler secret put CLEANUP_TOKEN

# 3 — schema + deploy
npx wrangler d1 migrations apply live-stream-db --remote
npx wrangler deploy
```

Then point the frontend at the Worker:

```bash
# repo root, .env.production (or a Cloudflare Pages environment variable)
VITE_API_BASE=https://live-stream-share-cast-api.<subdomain>.workers.dev/api
VITE_WS_BASE=wss://live-stream-share-cast-api.<subdomain>.workers.dev/api
```

And set `ALLOWED_ORIGINS` on the Worker to your Pages domain.

Frontend (Cloudflare Pages):

```bash
npm run build
npx wrangler pages deploy dist --project-name=live-stream-share-cast
```

A ready-made GitHub Actions workflow lives in
[`.github/workflows/deploy-worker.yml`](../.github/workflows/deploy-worker.yml)
— it needs two repository secrets: `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`.

---

## Layout

```
worker/
├── migrations/0001_init.sql     D1 schema
├── scripts/ws-test.mjs          realtime smoke test (chat + signalling)
├── scripts/seed.mjs             demo data via the API
├── src/
│   ├── index.ts                 Hono app, WebSocket upgrades, cron handler
│   ├── env.ts                   bindings + typed variables
│   ├── durable/
│   │   ├── chat-room.ts         per-stream chat, presence, liveness
│   │   └── signal-room.ts       per-stream WebRTC signalling
│   ├── lib/
│   │   ├── auth.ts              PBKDF2, JWT, sessions, middleware
│   │   ├── cleanup.ts           cron housekeeping
│   │   ├── do.ts                Durable Object helpers
│   │   ├── http.ts              errors, validation, CORS
│   │   ├── ids.ts               uuid, tokens, stream keys
│   │   ├── ratelimit.ts         best-effort limiter
│   │   ├── serialize.ts         row → API mappers
│   │   └── time.ts              ISO helpers
│   └── routes/                  auth, users, streams, media
└── wrangler.jsonc
```

## Tests

```bash
node scripts/ws-test.mjs        # 11 assertions over the realtime layer
```

## Notes / limitations

* Rate limiting is per-isolate (best effort). For hard guarantees add a WAF
  rate-limiting rule or a Durable Object counter.
* Password reset emails are not sent — see the TODO in `src/routes/auth.ts`.
* Chat history is unbounded; prune `chat_messages` per stream if a room gets
  very busy (the cron job currently only prunes `stream_stats`).
* D1 is a single-region database with read replication; keep write volume (e.g.
  presence updates) throttled as the Durable Objects already do.
