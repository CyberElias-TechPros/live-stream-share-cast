# Cloudflare backend for live-stream-share-cast ("I'm Live")
# Replaces Supabase: Auth + Postgres (D1) + Storage (R2) + Realtime (Durable Objects) + Edge Functions (Workers)

## 1. What it replaces (mapped from your repo)

| Supabase | Cloudflare |
|---|---|
| `auth` + `profiles` | `POST /api/auth/signup|login`, `GET /api/auth/me` (HS256 JWT, D1 `users`+`profiles`) |
| `streams`, `stream_sessions`, `stream_stats`, `chat_messages`, `followers` tables | D1 tables in `schema.sql` + REST in `src/routes/` |
| `generate-stream-key` fn | built into `POST /api/streams` (streamer-only, same rule) |
| `upload-recording` fn + `recordings` bucket | `POST /api/upload/recording` -> R2 `RECORDINGS` |
| `cleanup-recordings` fn | `POST /api/admin/cleanup-recordings` + hourly `crons` in `wrangler.toml` |
| Realtime broadcast `lan-stream-<id>` (`src/lib/lanStream.ts`) | `WS /api/signal/:streamId` via `SignalRoom` DO (same JSON protocol) |
| Realtime `chat_messages` | `GET/POST /api/streams/:id/chat` + `WS /api/streams/:id/chat/ws` via `ChatRoom` DO |
| `thumbnail_url` | `POST /api/upload/thumbnail` -> R2 `THUMBNAILS` |

Frontend files that must switch transport (no logic change):
- `src/integrations/supabase/client.ts` -> new `src/services/cfApi.ts` (base URL + JWT)
- `src/services/liveStreamService.ts`, `chatService.ts`, `profileService.ts` -> REST calls
- `src/contexts/AuthContext.tsx` -> `/api/auth/*`
- `src/lib/lanStream.ts` `openSignalChannel` -> `new WebSocket(API/signal/:id)`

## 2. Setup

```bash
cd cloudflare-backend
npm install
cp .dev.vars.example .dev.vars   # fill JWT_SECRET etc.

# D1 + R2 (one time)
npx wrangler d1 create livestream-db
# put returned database_id into wrangler.toml
npx wrangler r2 bucket create livestream-recordings
npx wrangler r2 bucket create livestream-thumbnails
npx wrangler d1 execute livestream-db --file=./schema.sql
npx wrangler d1 execute livestream-db --local --file=./schema.sql

# secrets (production)
npx wrangler secret put JWT_SECRET
# wrangler.toml [vars]: ALLOWED_ORIGINS="https://live-stream-share-cast.vercel.app", R2_PUBLIC_BASE="https://<your-r2-public>.r2.dev"

# dev / deploy
npm run dev
npm run deploy
```

R2 public access: bucket Settings -> Public access / custom domain, then set `R2_PUBLIC_BASE`.

## 3. Point Vercel frontend at it

In Vercel project `live-stream-share-cast` add env:
- `VITE_CF_API_URL=https://live-stream-share-cast-api.<you>.workers.dev`
- keep existing Supabase vars until migration is done, then remove.

Drop-in client: copy `cloudflare-backend/frontend-snippets/cfApi.ts` to `src/services/cfApi.ts`
and `lanSignal.ts` transport for `lanStream.ts`.

## 4. Notes / limits
- Auth is self-contained JWT (no email confirm, no OAuth). If you need Google/Twitch OAuth, keep Supabase Auth or add WorkOS/Clerk — D1 `profiles.id` stays the user key.
- LAN WebRTC media still P2P; only signaling moves from Supabase broadcast to `SignalRoom`.
- Recordings expire via cron hourly, same 6h default as `liveStreamService.ts`.
