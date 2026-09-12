# I'm Live — live streaming, straight from your browser

A P2P live-streaming platform: broadcast your camera from the browser, share a link,
and viewers watch in real time over WebRTC. Presence, chat, follow graph, broadcast
history and session stats included. No media servers — the host publishes directly
to each viewer (SFU-free star topology), while a Cloudflare Worker handles auth,
data and signaling.

**Stack:** React 18 + Vite + Tailwind + shadcn/radix · Cloudflare Workers + D1 + Durable Objects · WebRTC

---

## Features

- **Broadcast** — camera/mic preview with device checks and a live mic meter, pick
  resolution & FPS, go live in one click. Each broadcast gets a short room code and a
  10-minute room ticket that authorizes the host's signaling connection.
- **Watch** — low-latency WebRTC playback, live viewer count, real-time chat, "stream
  ended" handling when the host stops.
- **Video calls** — mesh rooms where every participant is on camera (up to 8): create a
  call from the Studio, share the link, everyone joins with their own ticket. Perfect
  negotiation handles refreshes and reconnects; the call ends when its creator ends it.
- **Chat** — authenticated REST messages fanned out through the room; persisted per
  stream; rate-limited (8 messages / 10 s per user).
- **Studio** — live dashboard with quality pre-checks, connection status, in-room chat
  monitor and graceful end-broadcast.
- **Dashboard** — broadcasts overview (peak viewers, time on air), metadata editing
  while live, delete (blocked while live), past sessions.
- **Profiles & follows** — public profile with live/offline grids, follow/unfollow.
- **Browse** — live + offline discovery with search, category filter.
- **LAN mode** — run the whole app on a machine connected to local Wi-Fi and everything
  (accounts, streams, chat, calls, dashboards) works **without any internet**. The UI
  detects it and shows a LAN badge, a QR invite and a no-STUN ICE config (see below).
- **Safety** — HttpOnly session cookies, login lockout, signup rate limiting,
  per-host single-broadcast conflict guard, CSP + hardened security headers.

## Architecture

```
Browser (host) ──┐                          ┌── Browser (viewer A)
                 │  WebRTC media (P2P, SRTP) │
Browser (host) ──┼─────────  ☁️  ────────────┼── Browser (viewer B)
                 │                           │
                 └──── Cloudflare Worker ────┘
                       ├─ REST API (/api/*) ── D1 (SQLite)
                       ├─ /api/room/:id/ws ──► RoomDO (Durable Object)
                       │     · WS signaling relay (offer/answer/ICE)
                       │     · presence + viewer counting
                       │     · chat fan-out, host-loss watchdog
                       └─ static assets (SPA) ── Workers Assets
```

- **One Durable Object per stream** (`RoomDO`) owns the room: relays WebRTC signaling,
  counts viewers, fans out chat, and if the host's socket drops it ends the broadcast
  after a 12 s grace period. Periodic alarm flushes keep D1 in sync; an hourly cron
  reclaims anything orphaned.
- **Why room tickets:** WebSockets can't send the HttpOnly session cookie on a
  cross-origin handshake, so the host authenticates over REST (`POST /start`) and
  receives a short-lived ticket that it presents as the first WS frame. Viewers join
  tokenless — a room is public.
- **Chat over REST:** for the same cookie reason, chat *sends* are plain
  authenticated POSTs; delivery is real-time via the room's fan-out.

## Repository layout

| Path          | What it is                                              |
| ------------- | ------------------------------------------------------- |
| `src/`        | React SPA (pages, design system, WebRTC engines)        |
| `worker/`     | Cloudflare Worker: REST API, RoomDO, D1 migrations, tests |
| `public/`     | Static assets (favicon, OG images, robots.txt)          |
| `dist/`       | Built SPA output (served by the Worker in single-origin mode) |

## Local development

Requirements: Node 20+ (22 recommended). Two terminals:

```sh
# 1. Backend + static serving (http://localhost:8787)
cd worker
npm install
npm run db:migrate:local     # apply D1 migrations to local state
npm run dev                  # wrangler dev on :8787

# 2. Frontend dev server with HMR (http://localhost:5173)
cd ..
npm install
npm run dev                  # vite; /api proxies to 127.0.0.1:8787
```

The Vite dev server proxies `/api` to the Worker (`API_TARGET` env overrides the
default `http://127.0.0.1:8787`), so login/session cookies just work in dev.

### Tests & checks

```sh
cd worker && npm test            # API + room integration suite (vitest, local D1/DO)
npm run typecheck                # frontend strict type-check (tsc -b)
npm run lint                     # eslint (flat config)
npm run build                    # production SPA build → dist/
```

## LAN mode & video calls (no internet needed)

I'm Live can run **entirely on your local network**. Because every feature talks to the
origin server (REST + WebSocket), serving the app from a LAN machine makes the whole
product work offline — accounts, streams, presence, chat, follows, dashboards and mesh
video calls included.

```sh
npm run lan        # builds the SPA, prints this machine's LAN addresses, serves on 0.0.0.0:8787
```

Others on the same Wi-Fi/LAN open `http://<your-ip>:8787` (the app shows a QR code in
the Studio and on call pages; `npm run lan:addresses` re-prints the addresses). Allow
port 8787 through your OS firewall if devices can't connect.

What changes in LAN mode (auto-detected from the request host — private/loopback/`.local`
addresses, overridable with the `DEPLOY_MODE` env var):

- **No internet ICE.** `/api/config` returns empty `iceServers`: same-subnet WebRTC
  connects with host candidates alone, so no STUN/TURN (and no internet) is needed.
- **LAN badge** in the navigation, plus "on the same Wi-Fi?" invite panels with QR codes
  in the Studio console and call pre-join screens.
- Everything else is identical — same accounts, same rooms, same features as online mode.

### Video calls

Calls are a stream kind (`kind: "call"`) built on the same rooms as broadcasts:

- Create one in the Studio ("Video call") and open it — the owner starts/rejoins;
  everyone else gets a **Join call** button once it's live.
- Every participant publishes to every other participant (mesh, perfect negotiation);
  up to **8 participants** (server-enforced), each publishing camera + mic.
- The creator's *End call* ends it for everyone; if the creator just disconnects, the
  room watchdog ends the call after a grace period. Non-creators can leave freely.
- Chat, presence, viewer counts, dashboards and history all work for calls exactly as
  for broadcasts.

## Deployment

### Single origin (simplest) — everything on Cloudflare

```sh
npm run build                                   # from repo root
cd worker
npx wrangler d1 create imlive                   # paste the id into wrangler.toml
npx wrangler d1 migrations apply imlive --remote
npx wrangler deploy                             # serves API + SPA from one domain
```

`ALLOWED_ORIGINS="*"` and `PUBLIC_URL=""` defaults are fine here — the API and the
frontend share an origin. Set `PUBLIC_URL` to your domain for canonical/sitemap URLs
and restrict `ALLOWED_ORIGINS` once you know it.

### Split origin — frontend on Vercel, API on Cloudflare

1. Remove the `[assets]` block from `worker/wrangler.toml`, set
   `ALLOWED_ORIGINS="https://your-app.vercel.app"` and deploy the Worker as above.
2. On Vercel, build the repo root with `npm run build` (output `dist/`) and set
   `VITE_API_URL=https://imlive-api.<your-subdomain>.workers.dev`.
   Session cookies are then issued `SameSite=None; Secure` for the cross-origin case.

### Optional production hardening

- **TURN** — set `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL` (e.g. Cloudflare
  Calls TURN) so viewers behind symmetric NATs can connect. Without it, hosts and
  viewers on hostile networks may fail to negotiate.
- **R2 recordings** — create an R2 bucket, uncomment the `[[r2_buckets]]` block, and
  recording upload/download endpoints switch from 501 to live.

## Configuration reference (`worker/wrangler.toml`)

| Var                | Meaning                                                        |
| ------------------ | -------------------------------------------------------------- |
| `ALLOWED_ORIGINS`  | Comma-separated origins allowed to call the API with credentials |
| `PUBLIC_URL`       | Canonical base URL for sitemap/links (derived from request if empty) |
| `TURN_URL` et al.  | Optional TURN relay for NAT traversal                          |
| `DEPLOY_MODE`      | Force `"lan"` or `"cloud"` (default: auto-detect from host)    |
| `SIGNUP_RATE_LIMIT`| Signups/hour/IP (default: 25 cloud / 100 LAN — override for load tests) |
| `DB` / `ROOM`      | D1 database and Durable Object bindings (required)             |

## Docs

- Privacy policy & terms of service: rendered in-app at `/privacy` and `/terms`.
- The full reconstruction/audit report lives in [`REPORT.md`](REPORT.md).
