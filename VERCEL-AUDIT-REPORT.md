# Vercel Account Audit — Projects Without Backend Configuration

- **Account scope:** `cybereliastkgmailcoms-projects` (CLI user `cybereliastk-7873`)
- **Audit date (UTC):** 2026-09-15
- **Method:** `vercel project ls` (2 pages, 30 projects) + `vercel env list --project <name>` for each project + `vercel project inspect <name>` (framework preset) for zero-env / frontend-only projects.
- **Definition of "backend configuration" on Vercel:** project has server-side env vars (e.g. `DATABASE_URL`, `POSTGRES_*`, `SUPABASE_*`, `MONGODB_*`, `FIREBASE_*` service keys, `JWT_SECRET`/`ENCRYPTION_KEY` paired with an API, `WORKER_URL`/`WORKER_INTERNAL_SECRET`, `API_URL` + storage bindings) **or** linked Vercel Storage / serverless API. A project with **zero env vars** or **only a frontend `VITE_*_URL` pointer to an external backend** counts as **no backend configuration on Vercel**.

## Summary

- **Total projects scanned:** 30
- **Zero env vars (no backend config):** 17
- **Frontend-only pointer (no real Vercel backend, external `VITE_API_URL` only):** 4
- **Total without backend configuration on Vercel:** 21
- **With backend config:** 9

## 1. No backend config — zero environment variables (17)

| # | Project | Production URL | Framework | Env vars |
|---|---------|----------------|-----------|----------|
| 1 | sound-shifter-local | https://sound-shifter-local.vercel.app | Vite | none |
| 2 | live-stream-share-cast | https://live-stream-share-cast.vercel.app | Vite | none — Supabase keys hardcoded in `src/integrations/supabase/client.ts`, no Vercel env |
| 3 | subscription-tracker | https://subscription-tracker-mu-henna.vercel.app | Next.js | none |
| 4 | see-my-business-contact-gain | https://see-my-business-contact-gain-cybereliastkgmailcoms-projects.vercel.app | TanStack Start | none |
| 5 | smart-attendance-hub | https://smart-attendance-hub-six.vercel.app | Vite | none |
| 6 | worker | https://worker-seven-nu.vercel.app | Hono | none — Hono app with no DB/auth env wired |
| 7 | clear-prompt-crafter | https://clear-prompt-crafter.vercel.app | Vite | none |
| 8 | graceline-answers | https://graceline-answers-cybereliastkgmailcoms-projects.vercel.app | Vite | none |
| 9 | cloud-gather-front | https://cloud-gather-front.vercel.app | Vite | none |
| 10 | tax-navigator-pro | https://tax-navigator-pro.vercel.app | Vite | none |
| 11 | toolbox | https://toolbox-gamma-lovat.vercel.app | Vite | none |
| 12 | web-tools | https://web-tools-eight-sigma.vercel.app | Vite | none |
| 13 | gif-wizard-pro | https://gif-wizard-pro.vercel.app | Vite | none |
| 14 | web | https://sambet.freegameplay.site | Next.js | none |
| 15 | t7m | https://t7m-one.vercel.app | Next.js | none |
| 16 | portify-developer-hub | https://portify-developer-hub.vercel.app | Vite | none |
| 17 | ke-town-digital-heritage | https://ke.freegameplay.site | Vite | none |

Recommended action per project: add a backend (Cloudflare Workers + D1/R2 as built for `live-stream-share-cast` in `cloudflare-backend/`) or link external API env vars (`API_URL`, `DATABASE_URL`, etc.) if the app needs persistence/auth.

## 2. Frontend-only pointer — external API URL, no Vercel backend (4)

These have env vars, but only a client-side backend URL pointing elsewhere. No DB/auth/storage configured **on Vercel itself**.

| Project | Production URL | Framework | Env vars found |
|---------|----------------|-----------|----------------|
| caption-grab-unleashed | https://caption.freegameplay.site | Vite | `VITE_API_URL` only |
| agreement-trust | https://agreement-trust.vercel.app | Vite | `VITE_API_URL`, `VITE_APP_NAME` |
| it-mastery-suite | https://it-mastery-suite.vercel.app | Vite | `VITE_API_URL` only |
| agently-home-hub | https://agently-home-hub.vercel.app | Vite | `VITE_API_URL` (Preview + Production) |

## 3. With backend configuration (9) — for contrast

| Project | Production URL | Backend signals |
|---------|----------------|-----------------|
| kids-ministry | https://kids-ministry-murex.vercel.app | `VITE_API_URL`, `JWT_SECRET`, `ALLOWED_ORIGINS`, `SEED_DEMO` |
| b1-glam-studio | https://b1-glam-studio.vercel.app | `VITE_API_URL`, `VITE_SITE_URL`, `JWT_SECRET`, `ENVIRONMENT`, `FRONTEND_URL`, `STUDIO_WHATSAPP`, `STUDIO_EMAIL` + GA |
| frontend | https://delgra.freegameplay.site | `VITE_API_URL`/`API_URL`, `VITE_WS_URL`, Turnstile, Paystack, VAPID |
| cea-os | https://www.cea.ng | `VITE_API_URL`, `VITE_WS_URL`, Paystack, VAPID |
| cybershop-web | https://shop.freegameplay.site | `WORKER_URL`, `WORKER_INTERNAL_SECRET`, `SITE_URL` |
| vachoma-bole-fusion | https://vachoma-bole-fusion.vercel.app | Full Supabase + Postgres: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, etc. |
| speed-buddy-check-up | https://speed-buddy-check-up.vercel.app | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` |
| cloudfront-forge | https://loop.freegameplay.site | `VITE_API_URL` + full Firebase set (`API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`, `STORAGE_BUCKET`, `MESSAGING_SENDER_ID`, `APP_ID`, `MEASUREMENT_ID`) + VAPID |
| vizier-web | https://vizier-web.vercel.app | `ENCRYPTION_KEY`, `JWT_SECRET`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL` |

## 4. Focus project: live-stream-share-cast

- Local dir audited: `src/services/*`, `src/lib/lanStream.ts`, `supabase/functions/*`, `src/integrations/supabase/*`.
- Supabase usage: Auth + `profiles`, `streams`, `stream_sessions`, `stream_stats`, `chat_messages`, `followers` + `recordings` storage + edge fns `generate-stream-key`, `upload-recording`, `cleanup-recordings` + Realtime broadcast `lan-stream-<id>`.
- Vercel state: **zero env vars** — highest-priority candidate for a Cloudflare backend.
- Cloudflare backend built: `cloudflare-backend/` (Workers + D1 + R2 + Durable Objects `ChatRoom`/`SignalRoom` + cron). See `cloudflare-backend/README.md`.

## 5. Reproduce

```powershell
vercel whoami
vercel project ls
vercel project ls --next 1788927158343
vercel env list --project <name>
vercel project inspect <name>
```
