# Deployment

Everything ships **code-complete**: the only work left at go-live is creating the
Cloudflare resources, pasting the ids into `worker/wrangler.jsonc` and adding the
keys you actually intend to use. Anything left unset degrades gracefully and is
reported by `GET /api/health` (`pendingConfiguration`) and in the admin console's
**Integrations** tab, so you always know what is still missing.

---

## 1. Backend — Cloudflare Worker

```bash
cd worker
npm ci
npx wrangler login                       # or export CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
```

### 1.1 Resources

```bash
# Database
npx wrangler d1 create live-stream-db            # paste database_id into wrangler.jsonc

# Object storage (recordings + avatars)
npx wrangler r2 bucket create lsc-recordings
npx wrangler r2 bucket create lsc-avatars

# Optional: KV for precise rate limiting + short-lived counters.
# Without it the limiter falls back to per-isolate memory (fine for small
# deployments, approximate under load).
npx wrangler kv namespace create CACHE           # paste id into wrangler.jsonc as CACHE
```

Durable Objects (`ChatRoom`, `SignalRoom`) need no provisioning — the
`migrations` block in `wrangler.jsonc` creates them on first deploy.

### 1.2 Database schema

```bash
npx wrangler d1 migrations apply live-stream-db --local    # dev
npx wrangler d1 migrations apply live-stream-db --remote   # production
```

Migrations `0001`…`0004` are ordered and idempotent; the GitHub workflow applies
them automatically before every deploy.

### 1.3 Required secrets

```bash
openssl rand -base64 48 | npx wrangler secret put JWT_SECRET
openssl rand -base64 32 | npx wrangler secret put CLEANUP_TOKEN
```

| Secret          | Why                                                        |
| --------------- | ---------------------------------------------------------- |
| `JWT_SECRET`    | Signs access tokens and hashes viewer fingerprints.       |
| `CLEANUP_TOKEN` | Authenticates `POST /api/admin/cleanup` (manual cron run). |

### 1.4 Optional integrations

Add only the groups you want; each is independently reported as configured or
missing by `/api/health`.

| Integration          | Variables                                                                    | What it unlocks                                                    |
| -------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Transactional email  | `EMAIL_PROVIDER`, `EMAIL_FROM`, plus one provider key (`RESEND_API_KEY`, `POSTMARK_SERVER_TOKEN`, `SENDGRID_API_KEY`, `MAILCHANNELS_API_KEY`, `EMAIL_WEBHOOK_URL`) | verification, password reset, moderation notices, follower fan-out |
| TURN relay           | `TURN_PROVIDER=cloudflare` + `TURN_KEY_ID`/`TURN_KEY_API_TOKEN`, or `TURN_PROVIDER=static` + `TURN_STATIC_USERNAME`/`TURN_STATIC_PASSWORD`, `TURN_URLS` | WebRTC for viewers behind symmetric NAT / mobile networks (10–20 % of sessions without it) |
| Captcha              | `CAPTCHA_PROVIDER=turnstile` + `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY` (or `hcaptcha` + `HCAPTCHA_SITE_KEY`/`HCAPTCHA_SECRET_KEY`) | bot protection on signup and password reset — the widget appears automatically once the keys are set; until then the check is skipped |
| Payments (tips)      | `FEATURE_TIPS=true`, `PAYMENT_PROVIDER=stripe` + `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (or `PAYMENT_PROVIDER=webhook` + `PAYMENT_WEBHOOK_URL`) | in-app tips with Stripe Checkout / a custom provider               |
| Web Push             | `FEATURE_PUSH=true`, `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY`, `PUSH_SUBJECT` (`npx web-push generate-vapid-keys`) | browser notifications when a followed channel goes live            |
| Product analytics    | `ANALYTICS_PROVIDER`, `ANALYTICS_SITE_ID`, `ANALYTICS_SCRIPT_URL`            | third-party page analytics (first-party analytics work regardless) |
| Error tracking       | `SENTRY_DSN`, `ERROR_REPORT_SAMPLE_RATE`                                     | server + client error forwarding                                   |
| Brand / legal        | `APP_NAME`, `APP_URL`, `SUPPORT_EMAIL`, `SOCIAL_*`, `TERMS_VERSION`, `PRIVACY_VERSION`, `LEGAL_ENTITY`, `LEGAL_JURISDICTION` | copy across the SPA, emails and receipts                           |
| Feature toggles      | `FEATURE_*` (see `worker/.dev.vars.example`)                                 | switch whole surfaces off without a redeploy                       |

Secrets (tokens/keys) via `wrangler secret put`; non-secret values can live in
the `vars` block of `wrangler.jsonc`. Anything set in the database
`feature_flags` table (admin console → Flags) overrides the env defaults.

> **Without an email provider** the app still works: verification and password
> reset links are written to the D1 outbox and logged, and (outside production)
> returned in the API response as `devToken`/`resetUrl`. Add a provider later and
> the backlog flushes on the next cron tick.

### 1.5 Webhook delivery (creators)

Creators add their own endpoints from **Settings → Integrations** (or
`POST /api/integrations/webhooks`). Events: `stream.live`, `stream.ended`,
`stream.scheduled`, `recording.ready`, `user.followed`, `chat.message`,
`tip.received`, `moderation.report`. Requests carry
`X-LSC-Signature: sha256=<hmac(secret, "<timestamp>.<raw body>")>`.

### 1.6 Deploy

```bash
npx wrangler deploy
```

Or push to `main` — `.github/workflows/deploy-worker.yml` runs `npm ci`,
`tsc --noEmit`, applies remote D1 migrations and deploys. It needs the repo
secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

---

## 2. Frontend

```bash
npm ci
cp .env.example .env            # VITE_API_BASE=/api by default
npm run build                   # → dist/
```

Hosting options:

* **Same origin as the Worker** (recommended): bind the Worker's route to your
  domain and let it serve `/api/*` while the SPA is served from Cloudflare Pages
  on the same host. No CORS, WebSockets work unchanged.
* **Split hosting**: set `VITE_API_BASE=https://<worker-host>/api` and
  `VITE_WS_BASE=wss://<worker-host>/api`, then set `ALLOWED_ORIGINS` on the
  Worker to the frontend origin(s).

```bash
# Cloudflare Pages
npx wrangler pages deploy dist --project-name=live-stream-share-cast

# Vercel
vercel deploy --prod
```

Remember to rebuild the SPA after changing `VITE_*` values — they are compiled
into the bundle. Runtime behaviour (features, limits, payment presets, captcha
site key, push key, TURN status) comes from `GET /api/config` and therefore
never needs a rebuild.

---

## 3. Post-deploy checklist

```bash
curl -s https://<worker-host>/api/health | jq
```

* `status: "ok"`, `database/r2/durableObjects: "ok"`
* `pendingConfiguration` lists exactly the integrations you have not added yet
* `curl -X POST https://<worker-host>/api/admin/cleanup -H "X-Cleanup-Token: …"`
  returns a `report` (also runs hourly via the cron trigger)
* Sign up, verify, go live from two browsers — chat and video should flow with
  media peer-to-peer (check `chrome://webrtc-internals` if the connection
  fails, and add TURN if it does)

Both suites run against a live API — local or deployed — and exit non-zero on
the first failed assertion, so they can gate a release:

```bash
npm --prefix worker run dev             # or point the suites at the deployed worker
npm run test:api                        # 87 REST checks across every journey
LSC_TEST_ADMIN_TOKEN=<operator jwt> npm run test:api   # + the operator console (100)
npm run test:realtime                   # chat + signalling over WebSockets
npm run test:api -- https://<worker-host>      # same suite against production
npm run typecheck                       # SPA
npm --prefix worker run typecheck       # worker

---

## 4. Operations

| Task                     | How                                                                       |
| ------------------------ | ------------------------------------------------------------------------- |
| Rotate the JWT secret    | `wrangler secret put JWT_SECRET` — every session is invalidated immediately |
| Inspect the audit trail  | Admin console → Audit, or `GET /api/admin/audit`                          |
| Resolve reports          | Admin console → Moderation                                                |
| Ban / unban an account   | Admin console → People                                                    |
| Toggle a feature         | Admin console → Flags (DB-level, survives redeploys)                      |
| Flush a stuck email queue| Admin console → Integrations → *Flush outbox*, or `POST /api/admin/email/flush` |
| Purge expired recordings | automatic hourly; manual via `POST /api/admin/cleanup`                    |
| Read client errors       | Admin console → Moderation → *Client errors*                              |

Backups: D1 supports Time Travel (`npx wrangler d1 time-travel restore`) and R2
objects can be replicated with a bucket rule; recordings expire on their own
per `RECORDING_RETENTION_HOURS` (or the creator's preference).
