# I'm Live — web + Android implementation roadmap

> **Living execution checklist.** Source-verified on **2026-10-30 UTC** against the
> `arena/aa9dc367-live-stream-share-cast` branch. This pass implements WebSocket
> tickets, production configuration validation, route splitting, a hardened
> signalling/chat path, and an Android native starter. This document is deliberately
> more honest than a feature inventory: code existing in the repository is not
> automatically production-ready, and an optional integration is not the same as
> an activated integration.

## 0. How to use this document

### Status legend

- `[x]` **Verified done** — present in the repository and backed by a meaningful
  local check, or a deliberate decision already implemented.
- `[~]` **Partially done** — a code path, UI, schema, or test exists, but an
  important production step, integration, or acceptance test is still missing.
- `[!]` **Known blocker/risk** — must be resolved before the affected journey is
  advertised or released.
- `[ ]` **Not started** — planned work with no reliable implementation yet.
- `[?]` **Decision required** — do not build the dependent work until the product
  or architecture decision is recorded.

Priority levels:

- **P0:** release blocker, data/privacy/security issue, or a core broadcast path
  that does not work.
- **P1:** required for a trustworthy public beta.
- **P2:** important for retention, scale, revenue, or operational maturity.
- **P3:** later polish, experimentation, and expansion.

Role key used in the checklists:

- **PM** — product/requirements and prioritisation
- **UX** — research, information architecture, interaction design, content
- **WEB** — React/Vite/web media implementation
- **API** — Worker/Hono/D1/R2/Durable Objects
- **AND** — native Android/Compose/WebRTC implementation
- **SEC** — security, privacy, abuse prevention, compliance
- **QA** — automated and exploratory testing
- **OPS** — Cloudflare, CI/CD, monitoring, incident response
- **GROWTH** — onboarding, analytics, creator success, distribution

### Definition of done for every item

An item is not complete merely because the code compiles. Close it only when all
of these are true:

1. The happy path and the expected failure path are designed and implemented.
2. Server-side authorization and validation exist; UI hiding is never treated as
   access control.
3. Loading, empty, offline, reconnecting, permission-denied, rate-limited, and
   provider-not-configured states have useful user-facing copy.
4. Web and Android use the same documented API semantics, error codes, and
   privacy rules.
5. Telemetry is present without leaking tokens, message contents, private URLs,
   or unnecessary personal data.
6. Automated coverage exists at the lowest useful layer plus one real end-to-end
   check for the journey.
7. Accessibility, performance, responsive layout, and device/network behaviour
   have been checked.
8. Documentation, migrations, environment variables, rollback steps, and
   release notes are updated.

---

## 1. Product north star and audience promise

### 1.1 The outcome we are building

> A creator can open **I'm Live** on a laptop or Android phone, grant camera and
> microphone permission once, go live in under a minute, share one dependable
> link, and have viewers join from a browser or Android app over an ordinary
> mobile connection. The audience sees and hears the creator with low latency,
> can participate safely in chat, follow the channel, receive a go-live alert,
> and watch a replay when the broadcast ends. The creator can see health and
> audience signals, recover from temporary failures, and control their data.

### 1.2 Primary audiences and jobs to be done

- **Mobile-first creator:** “I need to broadcast from a phone on variable mobile
  data without understanding WebRTC, TURN, codecs, or deployment.”
- **Web creator/host:** “I need a reliable preview, device selection, screen
  sharing, moderation controls, recording, and a link I can share anywhere.”
- **Viewer:** “I need to discover or open a link, start playback with one clear
  action, chat safely, follow, and recover when the host or network changes.”
- **Community moderator:** “I need to slow, mute, ban, hide, review, and audit
  harmful behaviour without guessing what happened.”
- **Platform operator:** “I need health, cost, abuse, privacy, migration,
  incident, and rollback controls before traffic arrives.”
- **Creator/integration developer:** “I need stable webhooks, API tokens, stream
  status, and documented event signatures.”

### 1.3 Product decisions that unblock engineering

- `[?][P0][PM]` Record the target launch cohort: private link-sharing,
  public creator discovery, or both. **Why:** the privacy model, indexing,
  moderation load, notification defaults, and media architecture differ.
- `[?][P0][PM/API/WEB/AND]` Record the media promise: **P2P-first for small
  rooms**, **server-assisted at scale**, or strictly P2P. **Why:** a full-mesh
  broadcast consumes one host upload path per viewer and will not serve a large
  public audience reliably. **Connects to:** `src/lib/lanStream.ts`,
  `worker/src/durable/signal-room.ts`, TURN, a future SFU/Cloudflare Stream or
  other media provider, and Android `PeerConnection`.
- `[?][P0][PM/API]` Decide whether “internet” means browser WebRTC only, or also
  OBS/RTMP/WHIP ingest. The current stream key is a credential-looking field,
  not an ingest server. **Why:** never advertise OBS support until an ingest
  protocol and media pipeline actually exist.
- `[?][P0][SEC/API/WEB/AND]` Choose the session transport: short-lived access
  token plus rotating refresh token (current approach), secure cookie session
  for web, or both. **Why:** browser localStorage is convenient but raises XSS
  blast radius; WebSocket query-string tokens can leak into logs. **Connects
  to:** `src/integrations/api/client.ts`, `worker/src/lib/auth.ts`, native
  secure storage, CSRF/origin controls, and WebSocket tickets.
- `[?][P1][PM]` Define age/maturity rules, prohibited content, creator
  responsibility, reporting SLA, appeal path, and regional availability before
  public launch.
- `[?][P1][PM/UX]` Decide supported languages, time zones, currencies, and
  payment countries. Store UTC in the API, display the viewer/creator locale,
  and do not hard-code USD-only copy if Nigeria/other markets are in scope.
- `[?][P1][PM/OPS]` Set launch thresholds: maximum P2P viewers per host,
  maximum broadcast duration, maximum recording size/retention, target join time,
  acceptable video start failure rate, chat latency, crash-free sessions, and
  support response time.

### 1.4 Success metrics and guardrails

- `[ ] [P0][GROWTH]` Instrument the funnel: landing → sign-up → permission
  granted → stream created → first live frame → first viewer connected → first
  chat/follow → stream ended → replay published.
- `[ ] [P0][GROWTH/OPS]` Define north-star metrics: successful live sessions,
  unique returning viewers, minutes watched, creator 7-day retention, and
  successful viewer connection rate.
- `[ ] [P1][SEC/OPS]` Define guardrails: reports per 1,000 chat messages,
  account lockouts, failed payment webhooks, TURN relay minutes, R2 storage,
  D1 error rate, and notification opt-out rate.
- `[ ] [P1][SEC]` Document data minimisation: IP retention, device/user-agent
  retention, watch fingerprinting, chat retention, recording retention, deletion
  grace period, analytics consent, and export/delete guarantees.

---

## 2. Verified repository baseline

### 2.1 What is already present

| Surface | Status | Evidence | What still prevents calling it production-ready |
|---|---:|---|---|
| Web SPA shell, routes, dark visual system, responsive components | `[x]` | `src/App.tsx`, `src/pages/*`, `src/components/*`, Tailwind/shadcn primitives | Needs UI E2E coverage, accessibility audit, device testing, and consistent error/empty states. |
| Fully offline browser room | `[~]` | `/offline`, `src/lib/offlinePeer.ts`, `src/components/OfflineBrowserRoom.tsx`, `public/push-sw.js` | Manual SDP offer/answer, empty-ICE WebRTC, app-shell caching, and explicit failure copy are implemented; real two-browser Wi-Fi and browser-matrix evidence remains. |
| React API client and DTO mappers | `[~]` | `src/integrations/api/client.ts`, `src/integrations/api/mappers.ts` | Needs an explicit versioned contract, non-JSON response handling, stronger types, token strategy decision, and mobile client parity. |
| Cloudflare Worker/Hono API | `[~]` | `worker/src/index.ts`, route modules, config and error envelope | Substantial surface exists, but external providers, production origins, abuse controls, media privacy, and staging verification remain. |
| D1 schema and four migrations | `[x]` | `worker/migrations/0001…0004.sql` | Needs remote migration rehearsal, backup/restore exercise, query/index review, and migration rollback policy. |
| R2 media bindings | `[~]` | `worker/wrangler.jsonc`, `worker/src/routes/media.ts` | Recording visibility must be enforced at byte-serving time; signed/private playback and cleanup need verification. |
| Durable Object chat/presence | `[~]` | `worker/src/durable/chat-room.ts`, realtime test | Host lifecycle, reconnect semantics, moderation fan-out, rate limits, and multi-region/load behaviour need browser tests. |
| Durable Object signalling | `[~]` | `worker/src/durable/signal-room.ts`, `src/lib/lanStream.ts` | The browser viewer currently requests the wrong signalling role; real media negotiation, ICE failure, reconnect, and scale are not covered by the fake-SDP test. |
| Auth, refresh rotation, account lifecycle, sessions, tokens | `[~]` | `worker/src/lib/auth.ts`, `worker/src/routes/auth.ts` | Email provider is optional/unconfigured; localStorage/query token exposure and recovery/security review remain. |
| Creator, viewer, browse, library, schedule, moderation, admin UI | `[~]` | `src/pages/*` and services | Many surfaces exist, but their complete journeys are not browser-tested; some are backed by placeholder/simulated client logic. |
| Notifications, web push, email outbox, webhooks, payments | `[~]` | `worker/src/lib/{notifications,email,push,webhook,payments}.ts` | Provider keys, consent, retries, idempotency, delivery monitoring, and regional/payment policy remain. |
| Android app | `[ ]` | No `android/`, Gradle, Kotlin, Compose, or native WebRTC project exists | Entire Android client, release pipeline, deep links, push, permissions, foreground service, and device matrix are outstanding. |
| CI/CD | `[~]` | `.github/workflows/deploy-worker.yml` | Only worker deployment is covered and it targets `main`; web build, lint, tests, security, preview, Android CI, and production smoke checks are absent. |

### 2.2 Baseline checks run for this roadmap

- `[x]` `npm run typecheck` — passes after route-level lazy loading, dynamic P2P
  limits, recording lifecycle, and WebSocket ticket client changes.
- `[x]` `npm run typecheck:api` — passes.
- `[x]` `npm run lint` — passes with the upgraded ESLint/TypeScript-ESLint stack.
- `[x]` `npm run build` — passes; route chunks are now split. The main entry is
  about **374 kB minified / 116 kB gzip** and the former roughly 1.31 MB monolith
  is gone. Vite's `__dirname` warning was removed.
- `[x]` `npm run db:migrate:local` — applies migrations `0001` through `0005`,
  including the one-use WebSocket ticket table.
- `[x]` `npm run test:api` against local Worker — **112/112 REST/privacy checks
  passed**, including public/unlisted/private bytes, invalid token, traversal,
  owner playback, deletion, no-ticket upgrade rejection, duplicate-start
  protection, owner-only viewer bookkeeping, and ICE config shape.
- `[x]` `npm run test:realtime` against local Worker — ticket-authenticated chat
  (including authenticated viewer admission and blocked-word rejection),
  signalling frame/role validation, fake-SDP relay, host disconnect, and the
  configured eight-viewer capacity rejection passed. It is still not a real
  camera/ICE network test.
- `[x]` exact-origin CORS/security-header smoke — allowed local origin is echoed,
  an unlisted origin receives no CORS grant, and CSP/permissions/security headers
  are present.
- `[x]` CI/release workflows now cover web/Worker quality, local migration/API/
  realtime smoke, audit, production config validation, environment-driven health
  checks, and Android compile/unit tests. The latest pushed Android gate passed;
  physical-device media validation and provider-side checks remain external.
- `[x]` Root and Worker `npm audit --omit=dev --audit-level=high` both report
  zero vulnerabilities locally. CI must repeat the gate; this does not replace
  provider-side/runtime scanning.
- `[!]` Real browser E2E, real WebRTC camera/ICE/NAT tests, accessibility tooling,
  load tests, remote migration/restore, Android compilation/device tests, and
  provider/credential validation remain release gates.

### 2.3 Remaining blockers to put at the top of the board

1. `[~] [P0]` **Real media path:** viewer signalling now uses the server-derived
   viewer role, host heartbeat/stop paths are wired, and the configurable P2P
   ceiling is enforced. A real browser camera-to-camera test across ICE/NAT,
   reconnection, visibility changes, and media-track failure is still required.
2. `[~] [P0]` **Recording product:** browser recording now has a bounded chunk
   lifecycle and an explicit local-download path; cloud publish remains a
   provider/device-scale decision because the current upload contract is a final
   blob. Add resumable multipart/R2 handling before promising long recordings.
3. `[x] [P0]` **Media privacy:** recording playback checks visibility/ownership,
   avatar access is authorized, and the contract suite covers public/unlisted/
   private, invalid-token, traversal, owner, and delete cases. Re-run this gate
   against the deployed CDN/proxy before launch.
4. `[~] [P0]` **Production configuration:** exact origins, secure fallback
   rejection, one-use WebSocket tickets, deployment validation, health checks,
   and environment-driven CI are implemented. Actual Cloudflare staging/
   production resources, secrets, provider credentials, backups, and rollback
   evidence still require operator access.
5. `[x] [P1]` **Client architecture drift:** route-level code splitting and the
   real player/creator path are in place; `src/services/streamService.ts` is now
   explicitly retained as the browser capture/settings/recording adapter, while
   `LanViewer`/`LanStreamer` remain the sole live media transport authority.
6. `[!] [P0]` **Android release gate:** the native project, secure auth, API
   client, ticket signalling, recv-only WebRTC session, Compose browse/watch
   flow, permissions, and foreground-service notification exist. Native rendered
   video/audio, creator capture/publish, chat/follow/library/settings, FCM,
   signed AAB, and device/network validation are not complete.
7. `[!] [P0]` **External acceptance:** TURN/SFU decision, browser/device matrix,
   accessibility automation, load/cost test, remote D1/R2/DO smoke, provider
   webhooks/email/push/payment credentials, legal copy, support runbook, and
   staged rollout still need real environments and owners.

---

## 3. Phase 0 — product, architecture, and delivery control room

**Goal:** eliminate ambiguous promises and create a release plan that can be
measured. **Depends on:** none. **Exit gate:** decisions in §1.3 are recorded,
owners are assigned, and a release board contains every P0/P1 item.

- `[x] [P0][PM/UX]` Capture the current product surface and repository map in
  this roadmap. **Why/achieve:** prevents the feature list in the README from
  being mistaken for verified production capability. **Connects to:** every
  later phase, the release board, and the public documentation.
- `[ ] [P0][PM]` Write one-page product requirements for creator, viewer,
  moderator, and operator journeys. Include preconditions, happy path, failure
  path, privacy expectation, and success metric for each screen.
- `[ ] [P0][PM]` Decide private link, public channel, or dual-mode visibility;
  define the exact URL and authorization rules for streams, chat, recordings,
  profiles, and schedules.
- `[ ] [P0][PM/API/WEB/AND]` Decide P2P audience ceiling and fallback provider;
  record why the choice fits expected cost, latency, privacy, Android support,
  and operations. Do not let TURN be mistaken for an SFU.
- `[ ] [P0][PM/API]` Decide whether OBS/RTMP/WHIP is launch scope. If yes,
  select the ingest service/protocol and draw the path from stream key to media
  output. If no, rename/remove OBS-style language from the UI and docs.
- `[ ] [P0][SEC/PM]` Approve privacy, retention, content safety, age/maturity,
  copyright/report/appeal, account deletion, and regional launch policy.
- `[ ] [P0][OPS]` Create a delivery board with IDs from this document, owner,
  priority, dependency, target milestone, status, evidence URL, and rollback
  note. Link PRs and test runs rather than relying on a checkbox alone.
- `[ ] [P1][UX]` Recruit representative web and Android testers: low-end Android,
  mobile data/NAT, older laptop, accessibility technology, creator, viewer, and
  moderator. Schedule moderated task tests before visual polish is considered
  complete.
- `[ ] [P1][PM/GROWTH]` Establish launch metrics, experiment policy, support
  channels, incident severity definitions, and a “kill switch” policy for live
  media, chat, payments, push, and signups.

---

## 4. Phase 1 — repository and engineering foundation

**Goal:** make every change buildable, reviewable, observable, and safe to
ship. **Depends on:** Phase 0. **Exit gate:** clean CI on every PR, reproducible
local setup, no known P0 lint/security failures, and a versioned release artifact.

### 4.1 Tooling and reproducibility

- `[~] [P0][OPS/WEB/API]` Add a root `npm run db:migrate:local` alias or correct
  every setup guide to use the same command. **Alias added in this pass.** Run
  both documented commands from a clean checkout and add migration CI coverage.
- `[ ] [P0][OPS]` Pin supported Node/npm versions with an explicit toolchain file
  and CI matrix. Record Wrangler compatibility and Cloudflare compatibility date.
- `[ ] [P0][WEB/API]` Define one environment schema for root Vite variables and
  Worker vars/secrets. Validate required production values at deploy time while
  allowing safe local defaults only in development.
- `[ ] [P0][OPS]` Add `.env.example` and `.dev.vars.example` validation that
  fails on accidental production URLs, wildcard production origins, weak JWT
  secrets, or placeholder payment/email/TURN values.
- `[ ] [P0][WEB/API]` Make API base URL, WebSocket base URL, public app URL,
  release version, and environment visible in a non-secret diagnostics object.
  Never expose secrets or raw tokens.
- `[ ] [P1][WEB]` Add bundle analysis and route-level lazy loading. Split admin,
  dashboard, charts, settings, auth, and creator studio from public browse/watch
  code; set a mobile budget for JS, CSS, images, and first interaction.
- `[ ] [P1][WEB]` Update browserslist/caniuse data, remove abandoned/deprecated
  packages where practical, and document any package that is retained for a
  deliberate reason.

### 4.2 Quality gates

- `[ ] [P0][WEB/API]` Fix all lint errors. Replace broad `any` with DTOs,
  discriminated unions, `unknown` plus validation, or a narrowly scoped rule
  exception with justification.
- `[ ] [P0][WEB/API]` Resolve hook dependency warnings and remove simulated/dead
  stream paths. Treat a warning in media lifecycle code as a reliability issue.
- `[ ] [P0][OPS/SEC]` Upgrade dependencies and regenerate both lockfiles. Run
  `npm audit`, `npm audit --omit=dev`, and Worker audit in CI; review advisories
  by runtime exposure rather than blindly forcing breaking upgrades.
- `[ ] [P0][WEB/API]` Add format/check scripts, typecheck both packages, build
  SPA, and run migration validation in one `npm run verify` command.
- `[ ] [P0][OPS]` Add pull-request workflow for web typecheck/lint/build, Worker
  typecheck, API contract tests, realtime tests, migration dry run, and audit.
- `[ ] [P0][OPS]` Add a staging deployment workflow that never runs on a PR’s
  untrusted code with production secrets. Make deployment environments explicit.
- `[ ] [P1][QA]` Add coverage reporting and minimum thresholds for API auth,
  authorization, serialization, media access, chat rules, analytics, and core
  web hooks/state machines.
- `[ ] [P1][OPS]` Add release tags/changelog, source-map policy, app/API version
  headers, and a way to correlate a client error with a deployed release.

### 4.3 Design and accessibility foundation

- `[ ] [P0][UX/WEB]` Audit every route for a page title, landmark structure,
  logical heading order, focus visibility, keyboard operation, dialog focus
  return, escape behaviour, and screen-reader names.
- `[ ] [P0][UX/WEB]` Add reduced-motion handling for aurora, grain, reveal,
  equalizer, and live animations; ensure animation is never the only status cue.
- `[ ] [P0][UX/WEB]` Verify dark-theme contrast for muted text, live badges,
  destructive states, chat moderation, disabled buttons, and form errors at
  WCAG AA targets.
- `[ ] [P1][UX/WEB]` Standardise skeleton, empty, retry, offline, rate-limited,
  permission, and not-configured components instead of bespoke silent failures.
- `[ ] [P1][UX/WEB/AND]` Create copy rules for live/offline/ended/reconnecting,
  camera/mic permission, TURN unavailable, recording upload, private content,
  ban/report, and payment failure. Translate technical errors into actions.
- `[ ] [P1][UX]` Test tap targets, safe-area insets, keyboard avoidance, landscape
  video, portrait chat, and one-handed creator controls at Android widths.

---

## 5. Phase 2 — API, data, security, and privacy hardening

**Goal:** make the Worker a stable platform contract shared by web and Android.
**Depends on:** Phase 1 and Phase 0 session/privacy decisions. **Exit gate:**
OpenAPI/contract is versioned, auth/authorization tests pass, private data is
protected, and staging secrets/providers are configured or deliberately disabled.

### 5.1 Contract and schema

- `[ ] [P0][API]` Produce an OpenAPI document for `/api` from the current route
  surface. Include request/response schemas, error codes, pagination, rate-limit
  headers, auth requirements, and WebSocket message schemas.
- `[ ] [P0][API/AND/WEB]` Generate or share typed clients from the contract where
  practical. Add a compatibility policy: additive changes first, deprecation
  window, API version, and migration note.
- `[ ] [P0][API]` Define a consistent error envelope with stable `code`, safe
  `message`, request ID, retryability, and field errors. Make web and Android
  render the same error semantics.
- `[ ] [P0][API]` Audit all list endpoints for cursor pagination, stable ordering,
  maximum page sizes, count cost, empty results, and duplicate-page behaviour.
- `[ ] [P0][API]` Add idempotency keys to stream start/stop, recording finalise,
  payment/tip creation, push subscription, webhook rotation, and destructive
  account actions.
- `[ ] [P1][API]` Review all D1 queries and indexes using realistic data volumes;
  add indexes for live listing, chat chronology, notifications, analytics rollup,
  reports, schedule/reminders, R2 recording lookup, and moderation restrictions.
- `[ ] [P1][API]` Rehearse migrations against a copy of staging data, document
  forward-only/rollback strategy, and test backup/time-travel restore before a
  schema change is allowed into production.
- `[ ] [P1][API]` Add a migration invariant check: required tables/columns/indexes,
  schema version, feature flags, and data protection constraints.

### 5.2 Authentication and authorization

- `[ ] [P0][SEC/API]` Decide and implement the production web session strategy;
  if bearer tokens remain, keep access tokens short-lived, minimise persistent
  storage, rotate refresh tokens safely, and protect against XSS. If cookies are
  used, add CSRF protection and strict SameSite/origin checks.
- `[x] [P0][SEC/API]` Replaced reusable WebSocket `?token=` credentials with
  short-lived, stream/role-scoped, single-use tickets stored only as hashes;
  upgrade routes consume them atomically and preserve origin validation.
- `[~] [P0][SEC/API]` The route matrix and local negative suite cover auth,
  ownership, IDOR/privacy, media, moderation, tokens, exports, webhooks, tips,
  and admin boundaries. Continue adding every route's banned/rate-limit/provider
  disabled case and deployed-proxy evidence.
- `[x] [P0][SEC/API]` Production JWT/Cleanup validation rejects missing,
  placeholder, or weak secrets; secret rotation/session invalidation procedure is
  documented, while actual provider-side rotation remains operational work.
- `[ ] [P0][SEC/API]` Keep password hashing cost current, validate password
  length/strength without unsafe over-restriction, prevent reset-token replay,
  redact reset URLs/tokens from logs, and test account lockout without account
  enumeration.
- `[ ] [P1][SEC/API]` Add email verification policy as a feature gate with clear
  unverified-account capabilities. Configure and verify a transactional provider
  before password recovery is considered launch-ready.
- `[ ] [P1][SEC/API]` Implement device/session management with friendly device
  labels, last-used time, revoke-one/revoke-all, suspicious-login signal, and
  audit events.
- `[ ] [P1][API/AND]` Provide refresh/re-auth behaviour suitable for Android
  process death, clock skew, network loss, and concurrent requests; never log
  access/refresh tokens.

### 5.3 Network, abuse, and input security

- `[~] [P0][SEC/API/OPS]` Production now rejects wildcard origins and runtime
  CORS echoes only exact configured origins; local defaults are development-only.
  Staging/production preflight, Android App Link origin policy, and deployed
  proxy evidence remain.
- `[~] [P0][SEC/API]` JSON size, upload byte, image MIME, filename/key
  normalisation, traversal, SDP/ICE frame, and retention limits are implemented;
  full MIME sniffing/decompression/timeouts and a deployed abuse scan remain.
- `[ ] [P0][SEC/API]` Bind rate limiting to a distributed KV or equivalent for
  auth, signup, password reset, chat, reports, uploads, WebSockets, search,
  webhooks, tips, and admin endpoints; test per-IP, per-account, and global
  behaviour.
- `[ ] [P0][SEC/API]` Review SSRF protections for creator webhooks, email relay,
  payment webhook/provider URLs, external images, and redirect/callback URLs.
  Block private/link-local address ranges and unsafe schemes where applicable.
- `[x] [P0][SEC/API]` Added security headers/CSP for the actual app/API/media/
  WebSocket origins and removed the external GPT Engineer bootstrap/social asset
  dependency. Provider-specific analytics/Sentry/payment CSP domains still need
  staging review before enabling those integrations.
- `[x] [P0][SEC/API]` Media routes look up recording rows before R2 bytes,
  enforce public/unlisted/private visibility, block traversal, honor retention,
  and issue short-lived HMAC playback tokens for protected VODs.
- `[ ] [P1][SEC]` Threat-model token theft, creator impersonation, stream-key
  leakage, malicious SDP/ICE frames, chat flood, report abuse, webhook secret
  exposure, payment replay, R2 enumeration, and account deletion abuse.
- `[ ] [P1][SEC/API]` Add audit entries for security-sensitive actions and ensure
  audit data is append-only to normal users, query-limited, privacy-aware, and
  export/delete policy is documented.

### 5.4 Privacy, deletion, and retention

- `[ ] [P0][SEC/API]` Map every stored field to purpose, retention, access role,
  export inclusion, and deletion/anonymisation behaviour.
- `[ ] [P0][API]` Make account deletion stop live sessions, revoke sessions/tokens,
  remove or anonymise public identity, detach/delete R2 objects according to
  policy, and complete the 30-day grace-period purge deterministically.
- `[ ] [P1][API/SEC]` Ensure notification, email, push, watch analytics, login
  attempts, client errors, reports, and audit logs follow documented retention
  and do not preserve deleted user data accidentally.
- `[ ] [P1][WEB/AND]` Capture terms/privacy/marketing/analytics/cookie consent
  versions with timestamp, user agent, and withdrawal path where legally needed.
- `[ ] [P1][SEC/QA]` Test export completeness against the schema and ensure it
  excludes password hashes, secrets, refresh hashes, webhook secrets, and raw
  payment credentials.

---

## 6. Phase 3 — live media reliability and scale

**Goal:** make “go live and watch” genuinely work on supported web and Android
networks. **Depends on:** API/auth hardening, media architecture decision, and
TURN/SFU choice. **Exit gate:** real camera-to-camera tests pass on local,
public, mobile, and failure networks with measurable recovery.

### 6.1 Correct the current WebRTC path first

- `[x] [P0][WEB/API]` Change `LanViewer.start()` to connect with `role: "viewer"`.
  The Worker derives host ownership from the authenticated user and does not
  trust a client role for authorization.
- `[~] [P0][QA]` The contract suite constructs viewer ticket URLs, rejects direct
  no-ticket upgrades, relays fake SDP, and tests host disconnect/capacity. A real
  browser offer/answer with camera tracks and ICE/NAT coverage remains required.
- `[~] [P0][WEB]` `StreamPlayer` owns the real `LanViewer` path and duplicate
  viewer count mutations were removed from the context. The legacy
  `streamService.connectToStream()` module remains only as an import-graph cleanup
  task; it is not the playback authority.
- `[~] [P0][WEB]` Creator/player lifecycle states now expose permission, connect,
  connected, error, ended, and recording transitions. A full cross-browser state
  machine for degraded/reconnecting/unsupported and every track failure remains.
- `[x] [P0][WEB]` Capability and secure-context checks are performed before live
  capture; recording support is checked before recording starts and unsupported
  actions receive explicit errors.
- `[~] [P0][WEB/API]` Host heartbeats run every 30 seconds while live, with
  idempotent stop/unmount cleanup and server stale-stream cleanup. Abnormal
  disconnect, token refresh, visibility suspension, and server-alarm tests remain.
- `[~] [P0][WEB/API]` Start/stop/heartbeat ownership and session uniqueness are
  guarded by conditional Worker updates, duplicate-start conflicts, and delayed-
  heartbeat rejection; a true two-tab race and browser-side recovery E2E remain.
- `[ ] [P0][WEB]` Handle page visibility/mobile suspension, track-ended/device
  unplug, permission revocation, sleep, network change, and tab restore with
  user-facing recovery and host/viewer-consistent state.
- `[~] [P0][WEB]` Signalling validates frame size/type, target ownership, roles,
  peer count, and rate, with ticket expiry/consumption. ICE restart, offer glare,
  bounded reconnect, and candidate queue recovery remain.
- `[~] [P0][API]` Server-side signalling authorization derives host identity from
  the authenticated ticket/session, rejects unissued/expired/reused tickets,
  validates frame types/roles/targets, bounds SDP/ICE/quality frames, applies a
  per-peer frame-rate cap, and enforces the configured P2P capacity. Real
  ICE/reconnect evidence remains.

### 6.2 ICE, TURN, and network matrix

- `[ ] [P0][OPS/API]` Provision a production TURN service, short-lived
  credentials, quotas, rotation, egress monitoring, and a safe “TURN missing”
  health status. Test UDP, TCP, and TLS relay paths.
- `[ ] [P0][QA]` Run browser interoperability tests: current Chrome/Edge,
  Firefox, Safari desktop, iOS Safari if supported, and Android Chrome/native
  app. Test same LAN, different home networks, symmetric NAT, corporate Wi-Fi,
  mobile 4G/5G, IPv6, packet loss, high RTT, and network handoff.
- `[ ] [P0][WEB/AND]` Show connection diagnostics without exposing private ICE
  candidates or credentials: direct vs relay, RTT, bitrate, resolution, packet
  loss, reconnect count, and a support correlation ID.
- `[ ] [P1][WEB/AND]` Implement adaptive capture/encoding: camera constraints,
  bitrate ceilings, frame rate, keyframes, CPU/battery response, bandwidth
  estimation, and a viewer quality request that cannot overload the host.
- `[ ] [P1][QA]` Verify audio/video sync, echo cancellation, noise suppression,
  mute/camera toggles, orientation, screen-share audio, and Bluetooth headsets.

### 6.3 Scale/fallback architecture

- `[x][P0][API/WEB/OPS]` Set the initial P2P viewer ceiling to eight, make it a
  validated Worker runtime variable, enforce it in `SignalRoom`, and expose it
  through `/api/config` so creator/player copy matches server behaviour. Revisit
  the number with real uplink/load evidence.
- `[ ] [P0][API/OPS]` Choose and integrate an SFU/server-assisted path for public
  streams above the ceiling (for example a managed WebRTC/SFU or a media
  platform). Define how stream IDs, auth, recording, moderation, metrics, and
  billing map to it.
- `[ ] [P1][WEB/AND]` Implement a transport selector: direct P2P → SFU/WebRTC →
  HLS/DASH/VOD fallback as product policy permits. Keep chat/presence independent
  from media transport.
- `[ ] [P1][API]` Add a media session/variant model so one stream can have host,
  P2P peers, SFU room, recording, and playback variants without overloading the
  `streams` row.
- `[ ] [P1][OPS]` Load-test connection setup, signalling fan-out, chat room
  presence, D1 writes, TURN, SFU join/leave, and recording storage at the chosen
  ceiling. Record cost per viewer-minute.

### 6.4 Creator capture and recording

- `[ ] [P0][WEB/AND]` Unify camera/microphone/screen capture controls across web
  and Android; persist only safe preferences, not device IDs that become stale.
- `[ ] [P0][WEB/API]` Finish browser recording: collect chunks, upload reliably
  to R2 (chunked/multipart or a final upload within limits), create/finalise the
  recording row, associate the session, retry transient failures, and recover
  after tab suspension where possible.
- `[ ] [P0][WEB/API]` Make “local download” and “publish to library” separate,
  explicit actions. Do not tell a user a recording is in the cloud when only a
  Blob URL was created.
- `[ ] [P0][API]` Make recording status transitions explicit: uploading,
  processing, ready, failed, expired, deleted. Emit webhook/notification only
  after a verified ready state.
- `[ ] [P0][API/SEC]` Enforce retention, max duration, storage quota, thumbnail
  ownership, clip parent permissions, and private/unlisted playback.
- `[ ] [P1][WEB/AND]` Add thumbnail/poster generation or upload, duration,
  resolution, captions/transcript hook, clip creation, resume position, and
  playback failure/retry UI.
- `[ ] [P1][AND]` Use an Android foreground-service recording/upload strategy;
  never assume a background activity can keep a large recording in memory.

### 6.5 OBS/ingest, if approved in Phase 0

- `[ ] [P0][API/OPS]` Provision the actual ingest endpoint and define stream-key
  lifecycle, rotation, revocation, scope, and leak response.
- `[ ] [P0][API]` Map ingest status to `streams`/`stream_sessions` and only mark
  viewers live after media readiness, not merely after a button click.
- `[ ] [P0][QA]` Test OBS reconnect, wrong key, rotated key, bitrate/resolution
  changes, no-audio, end-of-stream, recording, chat, and viewer playback.
- `[ ] [P1][WEB]` Add an OBS setup panel only after the above checks pass; remove
  claims from README/docs until then.

---

## 7. Phase 4 — web product implementation and polish

**Goal:** turn the existing route/component inventory into dependable web
journeys. **Depends on:** Phases 1–3. **Exit gate:** browser E2E covers the
critical creator/viewer/moderator paths on desktop and mobile viewport sizes.

### 7.1 App shell, routing, and runtime configuration

- `[~] [P0][WEB]` Runtime config is loaded through the platform service and now
  drives limits such as `maxP2pViewers`; callers retain safe defaults. A global
  stale-cache/maintenance UX and schema validation remain.
- `[~] [P0][WEB]` Route-level lazy loading and Vite SPA fallback are in place.
  Per-route error boundaries, retry controls, and safe post-auth return paths
  remain to be completed.
- `[x] [P0][WEB]` Local Open Graph artwork and manifest metadata replaced the
  external Lovable/GPT Engineer assets. Dynamic per-stream/profile/recording
  canonical metadata remains.
- `[~] [P0][WEB]` `manifest.webmanifest` and local artwork exist; the shared
  versioned push/app-shell service worker now caches the SPA shell and deep-route
  fallback for `/offline` while excluding API/auth/media requests. Full icon
  coverage, installability, and offline browser evidence remain.
- `[x] [P1][WEB]` SPA rewrites, API proxying, immutable asset caching, and
  runtime-config no-cache headers are configured in the Vite/deployment paths.
  Verify the exact host platform headers/rewrite rules during staging.
- `[ ] [P1][WEB]` Add mobile bottom navigation or an equivalent discoverable
  navigation pattern; avoid relying on the desktop floating nav at phone widths.

### 7.2 Identity, onboarding, and profile

- `[ ] [P0][WEB]` Test signup/login/logout/refresh across reload, multiple tabs,
  expired access token, failed refresh, deleted account, banned account, and
  offline recovery.
- `[ ] [P0][WEB]` Make password reset and email verification fully provider-backed
  in staging; verify links on another device and make expiry/replay copy clear.
- `[ ] [P0][WEB]` Build a first-run onboarding checklist: profile, streamer mode,
  camera/mic check, visibility, chat rules, notification choice, and first live
  action.
- `[ ] [P1][WEB]` Finish profile editing, avatar validation/crop, public links,
  donation link, pronouns, privacy settings, follower/following views, blocks,
  and deleted/banned states.
- `[ ] [P1][WEB]` Add shareable profile/stream/recording links with safe preview
  metadata and a copy/share fallback that works without clipboard permission.

### 7.3 Browse, discovery, and viewer journey

- `[ ] [P0][WEB]` Test landing → browse → search/suggest → category filter → stream
  detail with no results, slow results, API failure, stale live state, and
  pagination/infinite-scroll boundaries.
- `[ ] [P0][WEB]` Make live cards honest: do not render a live badge solely from a
  stale list; reconcile presence/host state when opening a stream.
- `[ ] [P0][WEB]` Implement the full viewer state sequence: metadata loading,
  stream offline, waiting for host, connecting, autoplay blocked, muted start,
  connected, degraded, reconnecting, ended, replay available, and unavailable.
- `[~] [P0][WEB]` Viewer signalling now uses the authenticated viewer ticket and
  role; the player has connection/error states and retry affordances. Full
  connect/retry/unmute accessibility and autoplay-blocked browser coverage
  remain. A separate `/offline` browser room now covers no-internet signalling
  with manual SDP exchange; it is deliberately not conflated with Worker-backed
  LAN media.
- `[ ] [P0][WEB]` Make player controls complete: play/pause, mute/volume,
  fullscreen, quality/transport explanation, captions hook, connection
  diagnostics, keyboard shortcuts, and touch controls.
- `[ ] [P0][WEB]` Treat chat as a product surface: history pagination, reconnect,
  rate limit, slow mode, followers-only, blocked words, mentions/replies,
  deleted/hidden messages, scroll position, unread indicator, and accessible
  announcements.
- `[ ] [P0][WEB]` Make follow, share, report, block, tip (when enabled), and
  “notify me” actions optimistic only when rollback/error copy is implemented.
- `[ ] [P1][WEB]` Add watch history/continue-watching semantics with consent and
  deduplication; do not count hidden/background tabs as active viewing.
- `[P1][WEB]` Add VOD playback, private/unlisted handling, clip creation, resume
  position, thumbnail fallback, expired recording state, and owner management.

### 7.4 Creator studio

- `[ ] [P0][WEB]` Make prepare flow atomic: validate title/category/tags against
  server limits, create or resume the stream, avoid duplicate streams on double
  click, and show the stream ID/key only to the owner.
- `[ ] [P0][WEB]` Add a preflight checklist for secure context, camera, mic,
  screen capture, codec, network, TURN, battery, and browser support.
- `[ ] [P0][WEB]` Add device selectors, live preview, camera/mic toggles, screen
  share, audio level, video resolution/frame rate, and a clear permission reset
  path.
- `[~] [P0][WEB]` Creator heartbeats, server start/stop results, P2P state, and
  recording transitions are wired; the UI still needs a richer authoritative
  media state machine for abnormal/network/device failures.
- `[x] [P0][WEB]` `startStream`/`stopStream` failures are surfaced and the UI does
  not claim live when the API rejects the operation; add two-tab race E2E before
  release.
- `[~] [P0][WEB]` Recording choice distinguishes local download from cloud VOD,
  bounds in-memory browser capture, and reports upload success/failure. Progress,
  resumable uploads, quota/finalisation state, and expiry UI remain.
- `[ ] [P1][WEB]` Add stream metadata editing while live only for safe fields,
  schedule handoff, stream key rotate/revoke, share panel, viewer diagnostics,
  and stream health/quality cards.
- `[ ] [P1][WEB]` Build dashboard analytics with date range, timezone, empty/new
  creator state, data freshness, definitions for every metric, and export.
- `[ ] [P1][WEB]` Add schedule create/edit/cancel, timezone conversion, reminder
  opt-in, go-live handoff, missed schedule, and recurrence policy if needed.

### 7.5 Moderation, trust, and admin

- `[ ] [P0][WEB/API]` Make channel rules visible before chat, enforce them in REST
  and WebSocket paths, and test follower age/slow mode/blocked-word races.
- `[ ] [P0][WEB]` Add report confirmation, duplicate-report handling, block/mute,
  evidence boundaries, and an explanation of what happens next.
- `[ ] [P1][WEB]` Finish creator moderation dashboard: message hide/restore,
  timeout/ban/unban, rule editing, current restrictions, audit history, and
  safe bulk actions.
- `[ ] [P1][WEB]` Harden admin console authorization and navigation; add loading,
  pagination, filters, confirmation, permission-denied, audit, and destructive
  action safeguards for users, streams, reports, bans, flags, categories,
  outbox, errors, payments, and cleanup.
- `[ ] [P1][OPS/WEB]` Turn integration readiness into actionable setup: provider,
  key location, test button, last success/failure, safe redaction, and rollback.

### 7.6 Notifications, integrations, and monetisation

- `[ ] [P1][WEB/API]` Configure email and verify templates/links in staging;
  drain outbox with retry/backoff, dead-letter visibility, override recipient,
  unsubscribe/preferences, and fan-out limits.
- `[ ] [P1][WEB/API]` Finish Web Push subscription lifecycle: permission UX,
  VAPID config, duplicate endpoint handling, invalid endpoint removal, quiet
  hours, per-event preferences, and a test notification.
- `[ ] [P1][WEB/API]` Test creator webhooks with HTTPS validation, HMAC signature,
  timestamp replay window, event filters, retries, pause-after-failure,
  rotation, test delivery, and secret display exactly once.
- `[ ] [P1][SEC/API/WEB]` If tips launch, complete provider onboarding, currency
  and fee policy, checkout redirect, webhook signature verification, idempotent
  settlement/refund, creator/tipper receipts, moderation, and failure states.
  Keep tips disabled until the full money movement path is verified.

---

## 8. Phase 5 — Android application from zero to production

**Recommended approach:** a native **Kotlin + Jetpack Compose** Android app that
shares the Worker/API contract and product rules with the web. Do not wrap the
current SPA for the creator path: camera, audio, foreground streaming, battery,
background lifecycle, notifications, and WebRTC diagnostics need native control.
A PWA/TWA can remain a lightweight viewer/discovery option if product research
shows it is useful, but it is not a substitute for a native broadcast client.

**Goal:** Android users can sign in, discover/watch, chat/follow, and reliably
broadcast with foreground-service and mobile-network behaviour. **Depends on:**
Phases 0–3 API/media decisions. **Exit gate:** Play-ready signed artifact,
privacy disclosures, device/network matrix passed, and browser/native
interoperability verified.

### 8.1 Android project and shared contract

- `[~] [P0][AND/OPS]` Created `android/` as a Kotlin/Compose starter with
  application ID, debug/release variants, JDK 17/SDK 35 configuration, signing
  placeholders outside Git, and a documented `IM_LIVE_API_BASE_URL`. The debug
  compile and JVM contract test pass in the GitHub Actions Android gate; local
  release signing and physical-device validation remain.
- `[~] [P0][AND]` The initial slice is intentionally one `app` module with
  separated auth/network/live/media packages rather than a premature multi-module
  tree. Split into feature modules after device-tested contracts stabilize.
- `[~] [P0][AND/API]` `ApiClient`, `AuthRepository`, `LiveRepository`, and the
  signalling client hand-maintain the current Worker REST/WS contract, including
  DTO mapping, refresh-once retry, one-use tickets, and structured errors. Full
  generated-client parity and pagination coverage remain.
- `[x] [P0][AND]` EncryptedSharedPreferences backed by Android Keystore stores
  access/refresh tokens; logout clears them and request logs exclude token values.
  Process-death, clock-skew, refresh-rotation, and logout-all device tests remain.
- `[x] [P0][AND]` Build-time endpoint selection is provided through the Gradle
  `IM_LIVE_API_BASE_URL` property; release rejects the documented placeholder and
  uses HTTPS outside debug.
- `[ ] [P1][AND]` Add shared analytics/error event names and release metadata so
  web/Android funnels can be compared without collecting unnecessary data.

### 8.2 Android UX foundation and navigation

- `[~] [P0][AND/UX]` A dark Compose theme and basic login/browse/watch/broadcast
  surfaces exist; full design-token parity, dynamic colour, reduced-motion, and
  responsive video treatment remain.
- `[~] [P0][AND/UX]` The starter navigation covers auth, browse, watch, and
  broadcast; search/profile/library/schedule/notifications/moderation/settings
  destinations are still missing.
- `[~] [P0][AND]` Basic loading/error/empty states and cancellation cleanup exist.
  Offline caching, process-death restoration, and every-screen retry contract
  require implementation and instrumentation tests.
- `[ ] [P0][AND/UX]` Complete TalkBack semantics, focus order, content
  descriptions, scalable text, touch targets, contrast, haptics, landscape, and
  fullscreen video validation on real devices.
- `[~] [P1][AND]` App Links are scaffolded with a placeholder host and guarded
  intent parsing; replace the host, publish `assetlinks.json`, and verify
  `/watch/:id`, profiles, and recordings in staging.
- `[ ] [P1][AND]` Add share sheet integration for streams/profiles/recordings and
  a clipboard fallback with privacy-safe preview text.

### 8.3 Android auth, profile, and discovery

- `[~] [P0][AND]` Login and logout use the shared Worker auth contract; sign-up,
  password reset, email verification, session-expiry copy, account deletion,
  and banned/unverified states remain.
- `[~] [P0][AND]` Live browse and watch loading exist; paging, search,
  categories, profiles, pull-to-refresh, offline cache, stale labels, and
  no-result recovery remain. Native watch now has initial follow-state loading,
  follow/unfollow, history-backed chat, reconnecting message send, and explicit
  moderation errors.
- `[~] [P1][AND]` Library and settings navigation placeholders exist; implement
  recording playback/management plus persisted profile, privacy, notifications,
  quality, data-saver, security/session, and legal controls.
- `[ ] [P1][AND]` Add local cache invalidation when following, blocking, logging
  out, deleting an account, or receiving a server-side ban.

### 8.4 Android viewer/media

- `[~] [P0][AND]` Native `PeerConnectionFactory`, recv-only audio/video tracks,
  SDP/ICE, ticket-authenticated signalling, server ICE/TURN parsing,
  `SurfaceViewRenderer`, and speaker routing are implemented in
  `WebRtcViewerSession`/`SignallingClient`. Real interoperability and lifecycle
  tests remain.
- `[~] [P0][AND/LAN]` Android-only offline LAN mode now provides a local TCP
  signalling server/client, manual IP/port/room-code joining, and empty-ICE
  server WebRTC media for Android-to-Android broadcasts. Same-WLAN physical
  validation, discovery/QR, and Android↔web local signalling remain.
- `[~] [P0][AND/API]` The viewer consumes the Worker ICE server response and keeps
  credentials out of UI copy/logs; direct-vs-relay diagnostics and TURN policy
  still need to be surfaced and tested.
- `[ ] [P0][AND]` Implement player lifecycle for foreground/background, rotation,
  Bluetooth route, speaker/earpiece, mute, autoplay/user gesture, reconnect,
  stream ended, and fallback transport.
- `[~] [P0][AND]` Native chat loads REST history, opens a ticket-authenticated
  ChatRoom socket, deduplicates by message ID, sends signed-in messages, refreshes
  one-use tickets on reconnect with bounded backoff, surfaces moderation error
  codes, and explicitly refuses offline sends. Typing/unread UI and Android
  reconnect/device tests remain.
- `[ ] [P1][AND]` Add captions/transcript surface if the chosen media path
  supports it, quality selector/data saver, player stats, and watch analytics
  heartbeat/end on lifecycle-safe hooks.
- `[~] [P1][AND]` Worker-backed web/Android interoperability remains unverified;
  the Android host → Android viewer offline LAN path is implemented but needs
  physical-device testing, while web host → Android viewer, Android host → web
  viewer, P2P/fallback transport, and chat/presence interoperability remain.

### 8.5 Android creator and foreground streaming

- `[~] [P0][AND]` Runtime camera/mic permission declarations, rationale copy, and
  denial handling are scaffolded. Device selection, front/back camera, torch,
  orientation, audio focus, Bluetooth, and permanent-denial settings recovery
  remain.
- `[~] [P0][AND]` A foreground service with a persistent notification and stop
  action exists. It does not yet own a real capture session or survive/recover
  process recreation with a published stream.
- `[~] [P0][AND]` Native camera/microphone capture → WebRTC sender, mute/camera
  toggle, front/rear switch, ICE/SDP handling, and teardown are implemented for
  the initial path. Bitrate/quality adaptation, screen share via MediaProjection,
  thermal response, and device validation remain.
- `[~] [P0][AND/API]` Native create/start/heartbeat/stop and host ticket flows
  are wired, and the service UI uses server-created stream state. Reconnect/ICE
  restart, viewer presence reporting, two-tab ownership races, and server-
  authoritative end-state validation remain.
- `[ ] [P0][AND]` Display battery, data-use, relay/direct, connection, and
  recording warnings with user controls; pause/stop gracefully on critical
  battery/thermal or permission changes.
- `[ ] [P1][AND/API]` Implement recording upload using a bounded file/chunk
  strategy, WorkManager retry for post-broadcast upload, quota/retention UI,
  encryption/privacy expectations, and a final ready notification.
- `[ ] [P1][AND]` Add schedule-to-go-live handoff, share link, stream key policy
  if ingest is approved, creator chat moderation, and dashboard summary.

### 8.6 Android push, release, and store readiness

- `[ ] [P0][AND/OPS]` Configure Firebase Cloud Messaging for release, map device
  token registration/removal to `/api/notifications/push/subscribe`, handle token
  rotation, deep-link payloads, notification channels, quiet hours, and tap
  routing.
- `[ ] [P0][SEC/AND]` Complete Play Data Safety, privacy policy, camera/mic/
  notification/foreground-service disclosures, account deletion link, content
  rating, copyright/report path, and third-party SDK inventory.
- `[ ] [P0][OPS]` Build signed AAB in CI using protected secrets, run static
  analysis, unit/instrumentation/UI tests, release notes, staged rollout, crash
  monitoring, and rollback/halting procedure.
- `[ ] [P1][AND/QA]` Test a device matrix: low-end Android, recent Pixel/Samsung,
  Android versions in support, small/large screens, notch/safe area, 4G/5G,
  Wi-Fi handoff, Bluetooth headsets, battery saver, background restrictions,
  camera permission history, TalkBack, and dark mode.
- `[ ] [P1][AND/OPS]` Create internal, closed, open-beta, and production tracks;
  gate native media changes behind remotely controlled, fail-safe flags.

---

## 9. Phase 6 — external services, operations, and production setup

**Goal:** activate only the integrations that have owners, budgets, privacy
review, failure handling, and a tested rollback. **Depends on:** Phases 2–5.

- `[ ] [P0][OPS]` Create separate Cloudflare accounts/resources or clearly
  separated environments for local, staging, and production D1, R2, DO, KV,
  Worker routes, custom domains, logs, and secrets.
- `[x] [P0][OPS]` Deployment health verification is now driven by the
  `WORKER_URL` secret/input, checks `/api/health`, and verifies the reported
  environment/commit when configured. GitHub execution is still pending.
- `[ ] [P0][OPS]` Provision remote D1/R2/DO/KV, apply migrations with a backup and
  approval, verify bindings, configure custom domain/TLS, and test WebSocket
  upgrade through the real proxy/CDN.
- `[~] [P0][OPS/SEC]` Production validation rejects wildcard origins,
  development secrets, insecure APP_URL, and missing required values; exact
  production secrets, legal versions, provider keys, limits, flags, log level,
  and release version still require provider-side configuration.
- `[ ] [P0][OPS]` Add staging smoke script: health/config, signup/login,
  verify/reset test email, create/start/heartbeat/stop, real browser host/viewer,
  chat/moderation, upload/private playback, push test, and cleanup.
- `[ ] [P0][OPS]` Configure TURN/SFU/ingest selected in Phase 0, quotas, alerts,
  credential rotation, provider outage mode, and cost dashboards.
- `[ ] [P1][OPS]` Configure email provider, verified sending domain, SPF/DKIM/DMARC,
  bounce/complaint handling, unsubscribe/preference links, staging override,
  templates, and outbox alerts.
- `[ ] [P1][OPS]` Configure Sentry/server logs/client error sampling with PII
  scrubbing, request IDs, release health, alert routing, and retention.
- `[ ] [P1][OPS/GROWTH]` Choose first-party/product analytics with consent,
  event schema, sampling, bot filtering, retention, and a dashboard for the
  launch funnel. Avoid loading third-party analytics before consent if required.
- `[ ] [P1][OPS/API]` Configure Web Push VAPID, FCM, provider payment keys,
  webhook secrets, return URLs, and integration test accounts only in staging
  first.
- `[ ] [P1][OPS]` Automate hourly cleanup verification, dead-letter/outbox
  monitoring, stale stream sweep alert, R2 retention, D1 storage, KV limits,
  Worker errors, DO alarms, TURN/SFU capacity, and payment reconciliation.
- `[ ] [P1][OPS]` Document incident runbooks: live media outage, chat abuse,
  credential leak, stream-key leak, R2 exposure, payment mismatch, notification
  flood, D1 migration failure, bad release, and account deletion request.
- `[ ] [P2][OPS]` Exercise restore, failover, secret rotation, provider outage,
  rollback, and incident communication at least once before public launch.

---

## 10. Phase 7 — verification matrix and release gates

**Goal:** prove the system works for real users, not just for mocked requests.
**Depends on:** all previous phases. **Exit gate:** every P0 is closed with
attached evidence and the release owner signs the go/no-go checklist.

### 10.1 Automated tests

- `[~] [P0][QA]` TypeScript/Worker typechecks, mapper/auth helpers, API error
  handling, media limits, and a Kotlin contract test exist. Expand unit coverage
  for retry/backoff, pagination, permissions, media state, and Android use cases.
- `[~] [P0][QA/API]` The local API suite covers 100+ positive/negative/privacy
  journeys, including malformed/auth/owner/token/media cases. Continue expanding
  every route's banned, rate-limited, duplicate, expired, and provider-disabled
  states.
- `[x] [P0][QA/API]` Fresh local D1 migration from empty state passes through
  `0005`; representative legacy-data/index/restore testing remains.
- `[ ] [P0][QA/WEB]` Add Playwright/Cypress-style browser E2E for auth, browse,
  watch, real chat, follow, report, creator go-live, end, recording, schedule,
  dashboard, settings, and admin permission boundaries.
- `[~] [P0][QA/WEB]` The offline protocol has bounded JSON parsing, room/type/version
  validation, empty-ICE configuration, and explicit permission/network failures;
  a real two-browser offer/answer run on Wi-Fi is still required.
- `[ ] [P0][QA/WEB/AND]` Add real WebRTC tests with two browser/device clients,
  real media tracks, ICE candidates, connection recovery, stream end, and TURN.
- `[~] [P0][QA]` Local WebSocket tests cover ticket/auth, role, frame validation,
  authenticated chat admission/blocked words, presence, host disconnect,
  capacity, and fake-SDP relay. Client reconnect/dedupe and full abnormal-
  disconnect coverage remain.
- `[~] [P0][QA/SEC]` Exact-origin/security-header, media privacy, ticket replay,
  traversal, and auth negative checks exist. Add dependency, secret, SAST, DAST/
  API abuse, SSRF, XSS/HTML, upload, and deployed-proxy privacy scans.
- `[ ] [P1][QA]` Add visual regression for public home, browse, watch/player,
  creator studio, chat, profile, dashboard, auth, and Android screenshots if
  the chosen test stack supports them.

### 10.2 Manual and exploratory matrix

- `[ ] [P0][QA]` Desktop: Chrome, Edge, Firefox, Safari; current and one prior
  supported version; camera/mic, autoplay, fullscreen, share, upload, and
  private media.
- `[ ] [P0][QA]` Mobile web: Android Chrome low-end/high-end, iOS Safari if web
  support is promised; portrait/landscape, keyboard, safe area, background,
  share sheet, mobile data, and permission recovery.
- `[ ] [P0][QA]` Native Android: every support-tier device/network combination
  in §8.6; include process death, foreground notification, screen lock, battery
  saver, thermal pressure, Bluetooth, and app update.
- `[ ] [P0][QA]` Accessibility: keyboard-only web, NVDA/VoiceOver/TalkBack,
  200% text, reduced motion, high contrast, colour-blindness, captions/copy,
  focus after dialogs, and live chat announcements.
- `[ ] [P0][QA]` Network: offline before login, offline during live, slow 3G,
  packet loss, high latency, captive portal, Wi-Fi↔mobile handoff, VPN,
  corporate firewall, IPv6-only, TURN TCP/TLS, and provider outage.
- `[ ] [P1][QA]` Content safety: spam, slurs/blocked words, harassment,
  impersonation, doxxing attempts, report flood, ban evasion, malicious links,
  copyright takedown workflow, mature content, and moderator disagreement.
- `[ ] [P1][QA]` Data/finance: export, delete, re-register after grace period,
  private/unlisted/public VOD, failed upload, expired recording, duplicate tip,
  payment webhook replay, refund, creator donation link, and currency display.

### 10.3 Performance and capacity

- `[ ] [P0][QA/OPS]` Set and measure Web Vitals for landing/browse/profile;
  JavaScript, CSS, image, and TTFB budgets on a low-end Android profile.
- `[ ] [P0][QA/API]` Load-test live listing/search, auth, chat, presence,
  signalling, notifications, D1 reads/writes, R2 upload/Range playback, and
  analytics rollups at launch assumptions plus a safety factor.
- `[ ] [P0][QA/AND]` Measure join-to-first-frame, reconnect time, video/audio
  start success, battery drain per hour, thermal state, data consumed, relay
  percentage, and creator upload time.
- `[ ] [P1][OPS]` Define SLOs and alerts: API availability/latency, successful
  live start, viewer join, chat delivery, recording ready, push/email delivery,
  crash-free Android sessions, and moderation queue age.
- `[ ] [P1][OPS]` Run a game day with a controlled incident and prove operators
  can disable signups, chat, tips, public discovery, P2P, or a faulty release
  without corrupting live sessions/data.

---

## 11. Phase 8 — beta, launch, and continuous improvement

- `[ ] [P0][PM/OPS]` Conduct a private alpha with invited creators/viewers;
  collect task completion, failure recordings, connection diagnostics, and
  qualitative feedback before public indexing.
- `[ ] [P0][QA/OPS]` Close every P0 with evidence; accept no “works on my
  machine” exception for live media, auth, private media, deletion, payments,
  or store permissions.
- `[ ] [P0][PM/OPS]` Run go/no-go review: scope, metrics, support coverage,
  provider budgets, moderation coverage, rollback, incident contacts, legal
  approvals, and app-store review status.
- `[ ] [P1][OPS]` Launch web behind a measured flag/allow-list; stage Android
  rollout internally → closed beta → small percentage → full release. Monitor
  each cohort before widening.
- `[ ] [P1][GROWTH]` Publish creator onboarding, stream safety/moderation guide,
  viewer help, privacy/recording explanation, troubleshooting guide, and support
  contact.
- `[ ] [P1][GROWTH]` Review funnel and connection telemetry weekly; prioritise
  failed first live, failed first frame, reconnect, permission, and creator
  retention issues over cosmetic feature volume.
- `[ ] [P1][OPS]` Review security advisories weekly, dependency updates monthly,
  secret rotation quarterly or after risk, backup restore quarterly, and access
  roles every quarter.
- `[ ] [P2][PM/API/AND/WEB]` Revisit P2P ceiling, SFU cost, creator demand for
  OBS/RTMP, captions, co-hosts, multi-guest rooms, moderation automation,
  subscriptions, and regional payments only after core reliability metrics are
  healthy.

---

## 12. Connection map: what each implementation step uses

| Capability | Web client | Android client | Worker/API | Cloudflare/third party | Data/telemetry |
|---|---|---|---|---|---|
| Sign up/login/session | React forms, API client, secure refresh handling | Compose forms, Keystore, typed client | `/api/auth/*`, PBKDF2/JWT/sessions | Email provider, captcha | auth audit, login attempts, client errors |
| Broadcast control | `StreamCreator`, media state machine | Broadcast feature + foreground service | streams/start/stop/heartbeat | DO signalling, TURN/SFU/ingest | stream sessions, health, quality stats |
| Camera/audio/screen | getUserMedia/getDisplayMedia | Camera/WebRTC/MediaProjection | signalling + ICE config | TURN and chosen SFU/ingest | bitrate, RTT, packet loss, join time |
| Viewer playback | `StreamPlayer`, WebRTC/fallback | native PeerConnection/player | signal ticket/room, playback auth | TURN/SFU/HLS if selected | watch session/heartbeat/end |
| Live chat/presence | Chat WebSocket + REST history | native WebSocket + local message state | `ChatRoom`, moderation routes | Durable Objects | message IDs, delivery latency, reports |
| Recording/VOD | MediaRecorder/upload/player | bounded file/chunk upload | media/recordings routes | R2 and optional processor | recording status, storage, retention |
| Discovery/profile | browse/search/profile pages | browse/search/profile screens | streams/search/users/recordings | CDN/cache | funnel, search, watch starts |
| Notifications | Web Push + inbox | FCM + inbox | notifications/outbox routes | VAPID/FCM/email provider | delivery/open/failure, consent |
| Tips/payments | checkout/tip UI | native/web checkout handoff | payment routes/webhooks | Stripe/custom provider | idempotency, settlement, refunds |
| Moderation/admin | creator/admin pages | creator moderation subset | reports/bans/rules/admin routes | abuse/rate limit providers | audit, queue age, actions |
| Operations | diagnostics/support UI | diagnostics/support UI | health/config/telemetry | Cloudflare logs/Sentry/analytics | SLOs, alerts, releases |

---

## 13. Suggested milestone slices

These slices keep the product usable while work continues instead of waiting for
all listed features to land at once.

### M0 — engineering baseline

Close Phase 0 decisions, lint/security debt, CI, staging, API contract, and
privacy/authorization review. No public promotion yet.

### M1 — reliable private live room

One verified creator can broadcast from web, one or a small capped audience can
watch from web/Android, real WebRTC/TURN works, chat is safe, liveness/reconnect
works, and recording is either genuinely uploaded or clearly local-only.

### M2 — public beta creator loop

Public discovery, profiles, follow/go-live notifications, VOD library, reports,
moderation, onboarding, analytics, support, and browser/Android beta release are
reliable. P2P ceiling and fallback are enforced.

### M3 — operational public launch

Production providers, data/privacy/store approvals, load/capacity, incident
runbooks, backups/restore, dashboards/SLOs, staged rollout, and rollback are
proven. All P0/P1 acceptance gates have evidence.

### M4 — scale and monetisation

SFU/ingest where needed, payments/tips with reconciliation, creator webhooks,
advanced analytics, captions, co-host/guest features, and regional expansion are
added only against measured demand and capacity.

---

## 14. Release sign-off checklist

A release owner should not sign off until every applicable line is checked and
linked to evidence:

- `[ ]` Product promise, audience, privacy mode, P2P ceiling, fallback, and
  OBS/ingest scope are documented.
- `[~]` Web typecheck, lint, build, and local migration/API/realtime checks pass;
  accessibility, browser E2E, real WebRTC, and production bundle budgets remain.
- `[ ]` Android unit/instrumentation/UI tests, signed AAB, device matrix, store
  disclosures, and staged rollout are ready.
- `[~]` Worker typecheck, migration checks, 100+ REST contract journeys,
  realtime ticket/capacity tests, and negative authorization tests pass; real
  WebRTC and remote-environment tests remain.
- `[x]` Viewer signalling uses the authenticated viewer role; host liveness
  heartbeat, stop cleanup, ticket replay rejection, and stale cleanup paths are
  implemented. Abnormal browser/device disconnect evidence remains.
- `[x]` Private recording/avatar/media access is tested with an unprivileged
  account, invalid token, traversal, owner playback, and deletion cases; repeat
  at the deployed proxy with expiring URLs.
- `[ ]` Auth recovery, session revocation, deletion/export, provider-disabled
  states, rate limits, and audit logging pass.
- `[ ]` Email, TURN/SFU/ingest, push, analytics, error tracking, and payments
  are either configured and tested or disabled with truthful copy.
- `[ ]` Staging smoke, load/capacity, backup restore, alerting, rollback, and
  incident game day have evidence.
- `[ ]` Support, moderation, terms/privacy, content policy, and release notes
  are published.
- `[ ]` Go/no-go owner, on-call owner, rollback command, feature kill switches,
  and post-release review date are recorded.

**Next execution order:** (1) run the committed CI and production validation
on GitHub with real staging values, (2) finish browser E2E and real WebRTC/ICE/
TURN evidence, (3) complete Android renderer/audio and native creator capture,
then device-test the shared contract, (4) choose and integrate the above-ceiling
SFU/fallback or keep public discovery capped, and (5) close provider, legal,
backup/restore, accessibility, load, support, and staged-rollout gates. Do not
claim a public launch until the remaining `[!]`/`[~]` items have evidence.
