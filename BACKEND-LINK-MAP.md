# Backend Link Map — Vercel UI → Cloudflare URL (no assumed domains)

- **Date (UTC):** 2026-09-15
- **Rule applied:** every Vercel frontend points at its *verified live* `workers.dev` URL (all health-checked this session). No guessed domains.
- **Env changes take effect on redeploy** — Vercel bakes env vars at build time. Redeploy each touched project (dashboard → Deployments → Redeploy, or push to its repo).
- **Secrets** for the new workers (`t7m` ADMIN_TOKEN/RATE_LIMIT_SECRET, livestream JWT_SECRET, ke-town/slams ADMIN_TOKENs) were generated, set via `wrangler secret put`, and stored **only** in a local file outside this repo (`NEW-BACKEND-SECRETS.txt` in the temp workspace — copy them into your password manager; they are NOT in git).

## New Cloudflare services created (Admin account, `c567…`, subdomain `autumn-surf-21ec`)

| Service | URL | Resources |
|---|---|---|
| `t7m-api` | https://t7m-api.autumn-surf-21ec.workers.dev | D1 `t7m` (`5a9046c1-…`, migration `0001_initial.sql` applied), R2 `t7m-attachments`, KV `t7m-RATE-LIMIT` (`e4de66b5…`), secrets set, `CORS_ORIGIN=https://t7m-one.vercel.app`. Health + `/v1/questionnaire` verified 200 |
| `live-stream-share-cast-api` | https://live-stream-share-cast-api.autumn-surf-21ec.workers.dev | D1 `livestream-db` (`4e3c4b05-…`, 7 tables), R2 `livestream-recordings` + `livestream-thumbnails` (r2.dev public), DO `ChatRoom`/`SignalRoom` (`new_sqlite_classes`), hourly cron, JWT secret set. `/api/health` 200 |

## New workers for workerless D1s (Cyber account, `e543…`, subdomain `cyber-e54` — must live with their D1s)

Generic token-auth CRUD (`cf-services/d1-rest-api/`): `GET /api/tables`, `GET/POST /api/:table`, `GET/PATCH/DELETE /api/:table/:id`; all data routes need `Bearer <ADMIN_TOKEN>`; table/column names whitelisted via `sqlite_master`/`PRAGMA`.

| Service | URL | D1 served (verified live data) |
|---|---|---|
| `ke-town-api` | https://ke-town-api.cyber-e54.workers.dev | `ke-town-db` — 32 tables (users, posts, events, products, orders, …). Unauth → 401, authed `/api/tables` → 200 |
| `slams-api` | https://slams-api.cyber-e54.workers.dev | `slams` — users, courses, enrollments, departments, sessions, attendance. Authed `/api/users` → 200 real rows |

## Vercel env changes applied (15 edits, 9 projects)

| Vercel project | Var | Value set | Basis |
|---|---|---|---|
| `t7m` | `NEXT_PUBLIC_API_BASE_URL` (prod+preview, added) | `https://t7m-api.autumn-surf-21ec.workers.dev` | Var name from `t7m` repo `.env.example`; URL just deployed |
| `live-stream-share-cast` | `VITE_CF_API_URL` (prod+preview, added) | `https://live-stream-share-cast-api.autumn-surf-21ec.workers.dev` | Name from `cloudflare-backend/README.md`; URL just deployed |
| `ke-town-digital-heritage` | `VITE_API_URL` (prod+preview, added) | `https://ke-town-api.cyber-e54.workers.dev` | House convention (name assumed — confirm in frontend source); URL just deployed |
| `smart-attendance-hub` | `VITE_API_URL` (prod+preview, added) | `https://slams-api.cyber-e54.workers.dev` | Same assumption note; URL just deployed |
| `frontend` | `VITE_API_URL`, `API_URL` (prod, updated) | `https://delgra.autumn-surf-21ec.workers.dev` | `/v1/health` 200, DB connected, 23 tables |
| `cea-os` | `VITE_API_URL` (prod, updated) | `https://cea-api.cyber-e54.workers.dev` | Cyber copy chosen (full stack: cea-db + R2 + queues in one account); `/v1/health` 200 db ok. WS var untouched |
| `kids-ministry` | `VITE_API_URL` (prod, updated) | `https://kidmin-harmony.autumn-surf-21ec.workers.dev` | `SEED_DEMO`/`ALLOWED_ORIGINS` markers + `/api/health` 200 |
| `agently-home-hub` | `VITE_API_URL` (prod+preview, updated) | `https://agently-home-hub-api.cyberelias-tk.workers.dev` | `/api/health` 200 |
| `vizier-web` | `NEXT_PUBLIC_API_URL` (prod, updated) | `https://vizier-backend.cyberelias-tk.workers.dev` | Bundle `ALLOWED_ORIGINS` lists `vizier-web.vercel.app`; `/api/health` 200. WS var untouched |

Already correct (verified, untouched): `cybershop-web.WORKER_URL` → `cybershop-api.calm-disk-8311`; `cloudfront-forge.VITE_API_URL` → `creatorloop-api.autumn-surf-21ec`.

## Deliberately untouched

- `it-mastery-suite`, `web` — their workers are ~1 KB stubs; pointing frontends at stubs fixes nothing. They need real backends deployed first.
- `b1-glam-studio`, `caption-grab-unleashed`, `agreement-trust` — backends are external/non-CF; values unreadable (sensitive) so left alone.
- `vachoma-bole-fusion`, `speed-buddy-check-up` — Supabase by design.
- `see-my-business-contact-gain` — worker was deleted; R2 images only; frontend var names unknown.
- `vizier-web` WS var, `cea-os` WS var — realtime targets unverified, left alone.
- Backend-less with no source/schema (`subscription-tracker`, `worker`, `clear-prompt-crafter`, `graceline-answers`, `cloud-gather-front`, `tax-navigator-pro`, `portify-developer-hub`) — nothing to build against.

## Custom domains later (Vercel side) — what to change

Adding a custom domain to a Vercel frontend does **not** change any URL in the table above (frontends point at Cloudflare, never the reverse). What *does* need updating is the **Cloudflare side allow-list**, otherwise browsers block the API as cross-origin:

| Worker | Var to extend with the new frontend origin |
|---|---|
| `t7m-api` | `CORS_ORIGIN` (redeploy or dashboard → Variables) |
| `live-stream-share-cast-api` | `ALLOWED_ORIGINS` in `cloudflare-backend/wrangler.toml` + redeploy |
| `ke-town-api` / `slams-api` | `ALLOWED_ORIGINS` in `cf-services/d1-rest-api/wrangler.{ke-town,slams}.toml` + redeploy |
| `cea-api`, `kidmin-harmony`, `delgra`, `vizier-backend`, `agently-home-hub-api`, `cybershop-api`, `creatorloop-api` | Their `ALLOWED_ORIGINS`/`APP_URL`/`SITE_URL` env (dashboard or repo `wrangler` config + redeploy) |

## Upstream follow-ups (in their own repos, not done here)

1. **`t7m` repo**: commit the real D1 id (`5a9046c1-…`) + KV id (`e4de66b5…`) into `apps/api/wrangler.jsonc`, and **remove dev-default `ADMIN_TOKEN`/`RATE_LIMIT_SECRET` from `[vars]`** (as done for this deploy) — otherwise the next `npm run deploy:api` overwrites the production secrets with dev defaults. CORS/URLs already production-pinned in the deployed config.
2. **`ke-town-digital-heritage` / `smart-attendance-hub` frontends**: confirm they read `VITE_API_URL` (assumed from house convention); your new ADMIN_TOKENs must be supplied to the frontend (header `Authorization: Bearer …`) since all data routes are token-gated.
3. Redeploy the 9 touched Vercel projects so the new env values take effect.
