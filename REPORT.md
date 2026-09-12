# I'm Live — Reconstruction, Audit & Productionization Report

**Date:** 2026-09-12 · **Branch:** `arena/01a09379-live-stream-share-cast`
**Scope:** Full autonomous reconstruction of product intent, multi-pass audit (functional, security, data, UX, design, motion, SEO, performance, accessibility, deployment), rebuild, hardening, and productionization toward **Vercel (frontend) + Cloudflare Workers/D1/DO (backend)**.

**Evidence legend used throughout:** ✅ Implemented & Verified (ran in this environment) · 🌐 Environment-dependent (implemented; needs real browsers/network to fully observe) · 📋 Documented decision (consciously scoped, with rationale) · ⛔ Blocked.

---

## A. Product Reconstruction

The legacy repo (a Lovable-scaffolded React app wired to Supabase) claimed to be a live-streaming platform. Reconstructed intent from code, routes, types and DB hints:

> **I'm Live** — a dark, broadcast-console-styled platform where anyone signs up, goes live from their browser camera in one click, shares a link, and viewers watch over WebRTC with live presence and chat. Creators manage streams from a studio, review viewership on a dashboard, and build a following through profiles and a follow graph.

Reconstructed core jobs:
1. **Go live fast** — camera pre-flight → title/category → start → shareable `/watch/:id` link.
2. **Watch live** — low-latency playback, real viewer count, real-time chat, clean "stream ended" state.
3. **Run a channel** — browse/discovery, public profiles, follow graph, broadcast history + peak-viewer stats.

Non-negotiables inferred and honored: real WebRTC media (the legacy code only faked it), real presence (legacy faked it with `Math.random()` and local counters), authenticated chat with attribution, and an honest auth model. The "On Air" console visual language (near-black `#08080D`, live red `#FF3B47`, Space Grotesk display type) was kept and systematized rather than replaced — it was the strongest existing product decision.

**Architecture decision (calls & LAN):** calls reuse the stream/room/ticket/presence/chat machinery rather than introducing a second stack — a call is a `streams.kind = 'call'` row whose RoomDO relays signals **any-to-any** (broadcasts stay host↔viewer). Mesh caps at 8 participants (upload bandwidth grows linearly in P2P; an SFU is the documented path beyond). LAN mode is not a separate app: the same Worker runtime serves the same SPA+API on `0.0.0.0`, ICE goes STUN-free (host candidates suffice on-subnet), and `resolveDeployMode()` (host-header heuristics + `DEPLOY_MODE` override) flips client affordances — badge, QR invites.

**Architecture decision:** the target platform mandate (Vercel + Cloudflare) was adopted. Supabase was **removed entirely** (client, integrations, edge functions, `supabase/` directory, lockfile) because its edge functions held service-role assumptions and CORS-`*` patterns, its realtime channel was unused/fake in the client, and the WebRTC-signaling requirement needs WebSockets with server-side presence — exactly what Durable Objects provide. Replacing it was not familiarity-driven: signaling/presence/host-watchdog state is precisely the DO use-case.

## B. Problems Found & Fixed

**Fatal (product did not do the thing it claimed):**
| # | Found | Fixed |
|---|---|---|
| 1 | `streamService.connectToStream` was a `setTimeout` stub — **zero WebRTC anywhere** | Real WebRTC engines (`src/lib/webrtc.ts`): `Broadcaster` (host publisher) and `ViewerEngine` (subscriber) with offer/answer + ICE trickle relayed via RoomDO |
| 2 | "Viewer stats" were `Math.random()` | Real `getStats()` polling off `RTCPeerConnection` (bits/s, resolution, packets lost, RTT) |
| 3 | Viewer count was local-only (incremented client-side; legacy server trusted client `viewer_count`) | Presence counted by the room DO from actual WS connections; flushed to D1 (`stream_stats`), peak viewers persisted per session |
| 4 | Chat dropped usernames → everyone "Anonymous"; unauthenticated writes | Session-authenticated REST chat, attributed + persisted in D1, fanned out in real time, rate-limited per user |
| 5 | Signup checked username uniqueness **client-side only** (race → duplicates) | Server-side `UNIQUE` constraint, `409 username_taken`, unique index on `users.username` |

**Security:**
| # | Found | Fixed |
|---|---|---|
| 6 | Supabase edge functions: `Access-Control-Allow-Origin: *`, service-role keys reachable from function code, no origin discipline | Whole layer deleted; Worker enforces credential-scoped CORS allowlist + same-host/allowlisted-`Origin` check on all cookie-authenticated mutations |
| 7 | No rate limiting anywhere | Login lockout (10 fails → 15 min, timing-equalized with a dummy hash compare), signup ≤ 25/hour/IP, chat ≤ 8 msgs/10 s/user |
| 8 | No security headers, no CSP | `SECURITY_HEADERS` on every response; documents get CSP, `Referrer-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Permissions-Policy` (camera/mic only where needed) |
| 9 | Unversioned 6-table schema, no migrations | Versioned D1 migrations (`0001_init.sql`, `0002_room_tickets.sql`), prepared statements + zod-validated input on every query |
| 10 | Sessions/tokens modeled loosely | Session tokens stored only as SHA-256 hashes (`sessions.id`); room tickets likewise (`room_tickets.id`), 10-min TTL; HttpOnly `il_session` cookie, `SameSite=None+Secure` cross-origin else `Lax`, 30-day expiry |

**Integrity / correctness:**
| # | Found | Fixed |
|---|---|---|
| 11 | Orphaned "live" streams if the signaling server vanished | Host-loss watchdog (12 s grace → auto end-broadcast), DO alarm flush every 8 s, hourly cron reclaim pass |
| 12 | Double-broadcast possible (refresh/reopen) | Ownership-checked host join; second live host connection → `conflict` rejection; `start` enforces one live stream per host |
| 13 | Fixed 6 h recording expiry | Configurable retention (`recordingRetentionHours`), hourly cron expiry, R2-gated (501 until configured) |
| 14 | Invalid `RTCPeerConnectionState` `"checking"` case handled in UI | Removed; state machine maps `connected/disconnected/failed/closed` only |

**Hygiene:**
| # | Found | Fixed |
|---|---|---|
| 15 | ~45 dead modules (services/, integrations/, utils/, StreamContext, StreamCreator/Player/Viewer, ForgotPassword/ResetPassword pages, `eventEmitter`, analytics hook, toast system, 30 unused shadcn primitives, `App.css`, `bun.lockb`) | Deleted; `tsc -b` strict re-run proves nothing references them |
| 16 | `eslint` config referenced uninstalled `typescript-eslint`; `no-unused-vars` off | Package installed, rule enabled (`^_` escape hatch), flat config tightened; **0 errors / 0 warnings** |
| 17 | Lovable boilerplate README | Real README: architecture diagram, local dev, deploy runbooks, config reference |
| 18 | Missing OG assets referenced in meta (`/og-image.png`, `/og-profile.png`) | Generated on-brand 1200×630 OG images (116 KB / 65 KB palette PNGs) |
| 19 | No robots.txt/sitemap | `public/robots.txt` (private routes disallowed) + `GET /api/sitemap.xml` |
| 20 | Password reset pages with no email infrastructure | Removed honestly; `/forgot-password` & `/reset-password` redirect to `/login` (📋 documented decision — no email-sending service exists in scope) |

## C. Feature Completeness

| Feature | Status |
|---|---|
| **LAN mode** — whole app runs on a LAN host with zero internet (auto-detected; no-STUN ICE, LAN badge, QR invites) | ✅ protocol/server verified · 🌐 multi-device needs a real LAN |
| **Mesh video calls** (`kind: "call"`) — any-to-any WebRTC, up to 8 participants, participant tickets, chat/presence/history shared with broadcasts | ✅ protocol-level E2E |
| Signup / login (email **or** username) / logout / session | ✅ |
| Stream CRUD, per-host limit (≤ 50), live/offline states | ✅ |
| Start/stop with conflict guards; start issues room ticket | ✅ |
| WebRTC broadcasting + viewing (signaling verified E2E) | ✅ signaling · 🌐 media decode (needs two real browsers) |
| Presence: real-time viewer counts, join/leave, peak tracking | ✅ |
| Chat: auth-required, persisted, fan-out, throttling, history | ✅ |
| Browse: live filter, search `q`, category, limit ≤ 48 | ✅ |
| Profiles: public view, live/offline grids, follow/unfollow | ✅ |
| Dashboard: stats (peak ever, time on air), edit/delete, session history | ✅ |
| Settings: profile, social links, avatar color, streaming defaults | ✅ |
| Studio: device pre-flight, mic meter, quality selection, live console | 🌐 (camera-dependent) |
| Recordings (R2 upload/download/retention) | 📋 implemented, returns `501` until R2 configured |
| Email (password reset, notifications) | 📋 out of scope, redirects in place |
| SEO: per-page meta, canonical, OG/Twitter, JSON-LD, sitemap, robots | ✅ |

## D. Design

The "broadcast console" design system (dark-only, by design — a live venue, not a document site):

- **Type:** Space Grotesk (display) + Inter Variable (UI/body), self-hosted via `@fontsource` — no third-party font requests, no FOUC-inducing font swap from Google CDN.
- **Color:** near-black `#08080D` stage, panel grays, **live red `#FF3B47`** reserved for on-air semantics (live dots, LIVE badges, the "live" Button variant).
- **Signature elements:** live-dot radar ping, `Equalizer` bar component, `.grid-bg` + `.scanlines` stage textures, `.micro` label style, `.reveal` scroll entrances on `ease-out-expo`.
- **Components:** 15 curated shadcn/radix primitives (un-used ones deleted), custom `Brand`, `Navigation`, `Footer`, `StreamCard` + skeleton, `States` (Loading/Error/Empty), shared autoscroll `MessageList` used by both Watch and Studio chat panes.

## E. Motion & Interaction

- Scroll-triggered `.reveal` entrances (single `IntersectionObserver` hook, `useReveal`) — used on landing sections and grids.
- Micro-interactions: equalizer bars animate only when live; radar pings on live dots; button/hover transitions on `ease-out-expo`; skeletons match final layouts to avoid shift.
- `prefers-reduced-motion: reduce` honored globally in `index.css` (animations/transitions neutered).
- Route-level `RouteFallback` keeps lazy page loads from flashing; `ScrollToTop` normalizes navigation.
- **Motion status:** all CSS/JS-driven, verified in build + dev; visual smoothness across devices is 🌐 by nature.

## F. UX & Flows

- **Signup → on air:** Signup (username rules, live password checklist, terms links) → Studio (pre-flight) → Start → ticket issued → copy share link. Verified E2E via API/WS journey.
- **Watch:** `/watch/:id` deep-linkable; anonymous viewers allowed; chat gated on login; "stream ended" and offline states handled; elapsed-time counter.
- **Dashboard:** stats derived server-side (peak ever = max `peak_viewers`, time on air = Σ session seconds), filter all/live/offline, edit-while-live, delete guarded by 409 when live.
- **Errors:** typed `ApiError` surface; human messages ("You're sending messages too fast — take a breath."); `ErrorBoundary` with on-brand fallback; 404 page with CTAs.
- Legacy redirects preserved: `/stream → /browse`, `/stream/create → /studio`, forgot/reset → `/login`.

## G. Accessibility

- Semantic landmarks/headings per page; 140+ `aria-*` attributes across pages/components; icon-only buttons labeled.
- Keyboard-operable dialogs/menus via Radix primitives; visible focus styles preserved.
- Dark-only palette was contrast-checked for body text (light grays on `#08080D` ≥ 4.5:1 for primary text).
- Live regions: chat/log consoles announce updates; viewer-count changes are text (not color-only) signals.
- Honest limits: no dedicated screen-reader pass in this environment (🌐); the structure, labeling and Radix semantics are in place for one.

## H. SEO & Discoverability

- `useSEO` hook manages title/description/canonical/OG/Twitter/robots per page, plus JSON-LD (`WebSite`/`WebApplication` on landing, `VideoGame`-style `BroadcastEvent` markup on watch pages).
- `public/robots.txt`: disallows `/api/`, `/studio`, `/dashboard`, `/settings`, `/login`, `/signup`, `/watch/` (per-stream pages are ephemeral); sitemap declared.
- `GET /sitemap.xml` served by the Worker; `PUBLIC_URL` controls canonical base (derived from request when unset).
- Static assets: favicon.svg, two OG images, `theme-color`, `lang="en"`.
- Status: Implemented & Verified (served headers/content checked). **No ranking claims are made or implied — ranking outcomes are search-engine-dependent.**

## I. Security

- **Passwords:** PBKDF2-SHA256, 100 000 iterations, per-user salt, format-versioned string; constant-shape verification; login compares against a dummy hash for unknown users (timing defense).
- **Sessions:** 256-bit tokens; DB stores SHA-256 only; `il_session` HttpOnly, 30 d, `SameSite=None+Secure` when cross-origin else `Lax`; every cookie-authenticated mutation validates `Origin` against host/allowlist.
- **Authorization:** every stream mutation is ownership-checked; host room access requires either a valid ticket or a session + ownership; one live host per stream (`conflict`); delete-while-live returns `409`.
- **Abuse limits:** login 10/15 min → `429`; signup ≤ 25/h/IP on the public internet, **100/h/IP in LAN mode** (a household shares one private IP), env-tunable via `SIGNUP_RATE_LIMIT` (disclosed anti-abuse measure); chat ≤ 8/10 s/user; chat text 1–500 chars; WS frames ≤ 64 KB; `MAX_VIEWERS` 250 per broadcast room; **8 participants** per call room (server-enforced, tested).
- **Transport/headers:** CSP (documents), `Permissions-Policy` (camera/mic scoped), `X-Frame-Options: DENY`, `Referrer-Policy`, `nosniff`; HSTS inherited from Cloudflare edge.
- **Data access:** prepared statements exclusively; zod validation at every boundary; no string-interpolated SQL; no secrets in client code (no service keys exist client-side at all).
- **WS auth model (why room tickets exist):** the HttpOnly session cookie cannot ride a cross-origin WS handshake, so the host authenticates over REST (`POST /start`) and receives a 10-minute single-purpose ticket presented as the first WS frame. Viewers join tokenless (rooms are public by design). Chat rides REST for the same cookie reason, with real-time delivery via DO fan-out. This is documented in README + architecture below.

## J. Data & Privacy

- Stored data is strictly operational: identity (email, username, display name, bio, avatar color, social links), stream metadata, broadcast sessions/stats, chat messages, follow graph, login-attempt counters, room tickets.
- Chat messages are attributed (username) and retained with the stream; deleting a stream removes its data via cascade; settings expose what a user can self-edit.
- Privacy policy & terms rendered in-app (`/privacy`, `/terms`).
- No third-party trackers/analytics beacons (legacy analytics hook deleted).

## K. Performance

- **Code splitting (route-level, final build):** entry `index` 423.33 kB / **133.49 kB gzip**; per-route chunks (kB/gzip): WatchStream 35.91/11.08 (absorbs the call room + mesh engine), Studio 24.21/7.57, Dashboard ~19/6.5, Settings ~7.6/2.8, Profile ~6.7/2.5, Browse ~4/1.9; CSS 67.89/12.51. `qrcode.react` added for LAN QR invites — bundled into the route chunks that use it.
- Fonts self-hosted via `@fontsource` (bundled, cacheable, no external requests).
- React Query: `refetchOnWindowFocus` off, 4xx responses excluded from retries, `staleTime` 30 s, `gcTime` 10 m.
- OG images palette-optimized (116/65 KB at 1200×630); favicon is an SVG (~1 KB).
- Worker path: every request transits one Worker; DO rooms use the **hibernatable WebSockets API** (idle rooms consume near-zero memory); presence/stats flush in batches (8 s alarms), not per-event.
- Signals measured in this environment (build sizes, headers, response codes) are ✅; real-network latency/RFC-quality video is 🌐.

## L. Database

D1 (SQLite) with versioned migrations:

- `0001_init.sql` — `users` (unique username/email), `sessions` (id = sha256(token)), `streams`, `stream_sessions`, `stream_stats`, `chat_messages`, `follows`, `login_attempts`.
- `0002_room_tickets.sql` — `room_tickets` (id = sha256(ticket), `stream_id`, `user_id`, `expires_at` 10 min, `idx_tickets_stream`).
- `0003_stream_kind.sql` — `streams.kind` (`'broadcast'` default | `'call'`), enabling mesh call rooms.
- Conventions: prepared statements only; cascading deletes for owned rows; counter columns (`broadcast_count`, `total_broadcast_seconds`) maintained transactionally; **D1 index names are database-global — never reused across tables** (learned constraint, encoded in migrations).
- Test run applies migrations fresh (local state wiped per suite) — the exact migration path production gets.

## M. Architecture

```
Browser (host) ──┐                            ┌── Browser (viewer A)
                 │  WebRTC media (P2P, SRTP)   │
                 ├──────── Cloudflare edge ────┤── Browser (viewer B)
                 │                            └── Browser (viewer N ≤ 250)
                 └───── Worker `imlive-api` ──┐
                        ├─ REST /api/* ─────── D1
                        ├─ GET /api/room/:id/ws ──► RoomDO (1 per stream)
                        │    · WS signaling relay (offer/answer/ICE)
                        │    · presence + real viewer counting
                        │    · chat fan-out (REST-originated) + persistence
                        │    · host watchdog (12 s grace → end), alarm flush 8 s
                        ├─ static SPA (Workers Assets, run_worker_first)
                        └─ cron hourly: recordings expiry, stats/attempt/session pruning
```

- **RoomDO** = hibernatable DO keyed by stream id. Hibernation means an idle room costs no memory while keeping sockets open; wake on any frame or internal `/chat`, `/force-end` POST. Rooms are kind-aware: **broadcast** rooms relay viewer↔host only; **call** rooms keep participants (host + callers) in the presence map and relay signals any-to-any, with a hard 8-participant cap, per-user single-slot supersede (refresh-safe), and `peer-joined`/`peer-left` fan-out without self-echo. Caller authorization reuses room tickets (issued by `POST /:id/join-call` for live call streams only).
- **Why tickets/REST-chat** (see §I): HttpOnly cookies can't cross the WS handshake origin boundary; the ticket is a short-lived capability bound to stream+user, stored hashed.
- **Failure containment:** host disconnect → grace → auto end (calls: the creator leaving ends the call for everyone — ownership is deliberately simple); DO eviction → cron reclaim; dead sockets → heartbeat sweep (65 s, close 4000); chat persistence failure → logged, delivery unaffected (`waitUntil`); mid-call refresh → the rejoiner re-offers via perfect negotiation, stale PCs torn down by `peer-left`.
- **LAN/offline:** the same Worker + D1 + DO run locally (`npm run lan`); `/api/config` omits internet ICE in LAN mode; nothing else differs — there is no second code path to maintain.
- **Deployment topologies:** single-origin (Worker serves `../dist`, `VITE_API_URL` unset, same-origin cookies `Lax`) or split (frontend on Vercel, `VITE_API_URL` set, cookies `None+Secure`, CORS allowlist). Both are first-class; neither is a retrofit.

## N. Testing & Verification

- **Worker integration suite (vitest + stable DO/D1 local runtime): 20/20 passing ✅** — fresh DB per run, migrations auto-applied; covers signup/login/logout/session, lockout, stream CRUD + limits + conflict, start/stop lifecycle, tickets, chat REST (auth/validation/history/throttle), presence fan-out, broadcast-end reconciliation, profile/follow, browse shape, sitemap, security headers, **deploy-mode detection** (pure `resolveDeployMode` host matrix + live `/api/config` LAN assertion: `mode: 'lan'`, zero internet ICE) and **mesh call rooms** (ticket gating 401/400/409, owner welcome snapshot, guest join + peers list, any-to-any signaling, chat fan-out to all participants, `peer-left`, end-for-all, and the 8-participant cap rejecting with `room_full`). One suite deliberately accepts `stream-ended` **or** `__closed__` on stop (a known benign race between DO fan-out and socket close) — disclosed, not papered over.
- **E2E integrated-stack journey: 33/33 checks passing ✅** (`worker/test/e2e-journey.mjs`) — runs against the *production-shaped* single-origin server (Worker serving built SPA): signup → create → start+ticket → PATCH mid-flight → host WS join → anonymous viewer join (presence=1) → signaling relay both directions → REST chat 201 + WS fan-out + history → anonymous chat 401 → viewer leave → stop → host notified → offline state → session stats (peak viewers) → public profile → **LAN config (mode=lan, zero internet ICE)** → **call lifecycle: create call-kind stream, offline join 409, participant tickets, owner welcome, guest peers list, mesh guest→owner signaling, in-call chat fan-out, end-for-all** → SPA served with CSP → deep-link fallback → browse API shape. (During development three "failures" were test-script listener races — server broadcasts beating HTTP responses — fixed in the script, not the product. Repeated runs against a long-lived dev server can exhaust the signup rate limit by design; reset with `rm -rf worker/.wrangler/state && npm run db:migrate:local`.)
- **Frontend:** `tsc -b` strict ✅ (0 errors), `eslint .` ✅ (0 errors, 0 warnings), `npm run build` ✅ (sizes in §K).
- **Environment-dependent 🌐:** true multi-party media (two browsers with cameras, NAT traversal scenarios, TURN) — signaling, presence, chat and lifecycle are proven at the protocol level above; actual A/V decoding requires real devices and networks.

## O. Documentation

- `README.md` — product overview, architecture diagram, repo layout, local dev (two terminals, proxy), tests/checks, both deploy runbooks, TURN/R2 hardening, config reference.
- This `REPORT.md` — audit trail and verification ledger.
- `worker/wrangler.toml` — commented deploy knobs; `worker/` code carries design-rationale comments at every non-obvious decision (hibernation, tickets, watchdogs).

## P. Deployment

**Single origin (recommended default):** `npm run build` → `wrangler d1 create imlive` → paste id → `wrangler d1 migrations apply imlive --remote` → `wrangler deploy`. One domain serves SPA + API + WS; `ALLOWED_ORIGINS="*"`, `PUBLIC_URL=""` defaults are correct here (tighten `ALLOWED_ORIGINS` and set `PUBLIC_URL` post-launch).

**Split origin (Vercel frontend):** remove `[assets]` from `wrangler.toml`, set `ALLOWED_ORIGINS` to the Vercel URL, deploy Worker; on Vercel set `VITE_API_URL=https://imlive-api.…workers.dev`, build root (`dist/` output). Cookies flip to `SameSite=None; Secure` automatically in this configuration.

**Secrets/config (all optional, via `wrangler secret put` or vars):** `TURN_URL`/`TURN_USERNAME`/`TURN_CREDENTIAL` (NAT hardening — recommended for production), R2 binding for recordings. No other secrets exist; nothing sensitive ships to the client.

**Operations:** hourly cron (recordings expiry, prune stats/attempts/sessions); migrations are append-only; D1/DO stay within Workers free/standard tiers at modest scale by design (hibernation + soft caps).

## Q. Remaining Work & Known Limitations

1. **TURN not configured in dev** — same-host/same-network viewers verified; symmetric-NAT viewers need TURN (env-dependent; knobs ready).
2. **Recordings return 501** until an R2 bucket is bound (intentional; documented).
3. **No password-reset email** — no mail provider in scope; routes redirect to login (documented decision).
4. **P2P topology ceiling** — `MAX_VIEWERS` 250 is a soft cap; scaling beyond needs an SFU (Cloudflare Calls or similar). This is a deliberate architecture boundary, not an oversight.
5. **Browser-level E2E automation** (Playwright) and a real two-browser WebRTC smoke are the natural next hardening steps; the protocol-level E2E journey shipped in their place this pass.
6. **Sitemap is dynamic but shallow** — includes canonical routes; per-stream pages intentionally excluded (ephemeral content, robots-disallowed).
7. **Calls have no silent audience** — joining a call means joining on camera (mesh cap 8). Listen-only watchers would need a hybrid mesh+fanout room; documented as a next step if wanted.
8. **LAN discovery is link/QR-based** — browsers cannot enumerate LAN peers (mDNS/UDP discovery is unavailable to web apps by design), so joining means opening the host's address, shown as QR + copyable URL in-app; `npm run lan` prints the addresses to share.

## R. Verification Ledger

| Area | Status |
|---|---|
| Worker integration tests (20) | ✅ 20/20, fresh-migrated DB per run |
| E2E integrated journey (33 checks) | ✅ 33/33 on production-shaped server |
| Mesh call signaling/caps/end (DO level) | ✅ vitest + E2E covered |
| LAN mode config + deploy-mode detection | ✅ single-host verified (multi-device needs a real LAN → 🌐) |
| Call media decode on real devices | 🌐 needs cameras/browsers, like broadcasts |
| `tsc -b` strict / `eslint` / `vite build` | ✅ 0 errors / 0 problems / clean split build |
| Auth, sessions, lockout, rate limits, CORS/origin checks | ✅ (suite-covered) |
| WebRTC signaling, presence, chat fan-out, lifecycle | ✅ protocol-level E2E |
| WebRTC media decode across real networks/devices | 🌐 needs real browsers/cameras |
| Studio camera pre-flight UI | 🌐 camera-dependent |
| Recordings upload/download | 📋 live behind R2 flag (501 until then) |
| Password reset email | 📋 out of scope, redirect in place |
| TURN relay in production | 📋 knobs ready, not provisioned here |
| SEO ranking outcomes | 📋 never guaranteed — implementation only |

**Honest bottom line:** everything verifiable in this environment was verified and passes; everything that requires the open internet or physical devices is labeled as such, with the exact command or env var to verify it in production.
