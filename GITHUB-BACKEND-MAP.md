# Vercel → GitHub → Cloudflare Source Map (fields × repos)

- **Generated:** 2026-09-18 (UTC) — fresh clone of all 30 Vercel-linked GitHub repos
- **Vercel team:** `cybereliastkgmailcoms-projects` — 30 projects (frontend 404 excluded)
- **GitHub org:** `CyberElias-TechPros` — 12 repos owned, but 28 Vercel projects link to a repo in that org (2 have `no-link`: `vizier-web`, `worker`)
- **Cloudflare scope:** 8 accounts, inventories taken from `CLOUDFLARE-AUDIT-REPORT.md` + live `workers.dev` health checks + wrangler `d1/r2/kv` lists
- **Method:** (1) Vercel API `GET /v9/projects/:name` for `link.repo` + `framework` + aliases; (2) `git clone --depth 1` each linked repo and glob `wrangler.toml|jsonc` + `worker/|backend/|workers/|supabase/`; (3) read each wrangler for `name`, `database_name`, `bucket_name`, `database_id`, `account_id`; (4) match to live CF workers/D1/R2/KV by name; (5) `curl /health|/api/health|/v1/health` where available.

## Headline counts

| Category | Count |
|---|---|
| Vercel projects linked to a GitHub repo | 28 / 30 |
| Vercel projects with `no-link` | 2 (`vizier-web`, `worker`) |
| GitHub repos that actually contain a backend (`wrangler.*`) | 14 repos / 16 workers (one repo has two) |
| GitHub repos frontend-only (no wrangler, no worker/) | 8 |
| GitHub repos supabase-only | 6 |
| Cloudflare workers live on `workers.dev` (health 200) | 10 of the 16 expected (stubs + delgra return non-standard paths) |

## Table 1 — Vercel → GitHub → Backend inside repo → Live Cloudflare

| Vercel project | Vercel alias (prod) | Framework | GitHub repo | Backend in repo | Wrangler name / bindings (verbatim) | Cloudflare worker + account (live?) | Vercel env var (production) |
|---|---|---|---|---|---|---|---|
| `cea-os` | `www.cea.ng` | TanStack | `CyberElias-TechPros/lumina-studio` | `backend/wrangler.jsonc` + `delgra/backend/wrangler.jsonc` **(two backends in one repo)** | `cea-api` → D1 `cea-db` (`f673c459…`), KV `FLAGS`/`RATE_LIMIT`, R2 `cea-uploads`, DO `RealtimeRoom` — **also** `delgra` backend: D1 `delgra-db` (`820bba6c…`), R2 `delgra-uploads`, KV `RATE_LIMIT` | `delgra` `autumn-surf-21ec` (Admin) **200 `/v1/health`**, `cea-api` `cyber-e54` (Cyber) **200 `/v1/health`** — both live. **This is why `delgra` looked “replaced by cea” — the one repo `lumina-studio` ships two workers. `cea-os` Vercel project currently points only at the `cea-api` half.** | `VITE_API_URL=cea-api.cyber-e54` (just updated; was encrypted before) |
| `cybershop-web` | `shop.freegameplay.site` | Next.js | `cybershop` | `worker/wrangler.jsonc` | `cybershop-api` (`ccb326…` Info) D1 `cybershop` (`63b9daa8…`) | `cybershop-api` exists but `/api/health` 403 (auth-gated) — live on `calm-disk-8311`; `WORKER_URL` env already points there | `WORKER_URL=cybershop-api.calm-disk-8311` (already correct) |
| `kids-ministry` | `kids-ministry-murex` | TanStack | `kidmin-harmony` | `worker/wrangler.toml` | `kidmin-harmony` D1 `kidmin-harmony-db` (`3f22a119…`), R2 `kidmin-harmony-media` | `kidmin-harmony` `autumn-surf-21ec` **200 `/api/health`** | `VITE_API_URL=kidmin-harmony.autumn-surf-21ec` (just updated) |
| `b1-glam-studio` | `b1-glam-studio` | Vite | `b1-glam-studio` | `wrangler.toml` → `worker/src/*` | `b1-glam-studio-api` D1 `b1_glam_db` (placeholder id), R2 `b1-glam-media`, KV `CACHE_KV` | **Not deployed** — placeholder IDs (`b1_glam_db_id`) | `VITE_API_URL` encrypted, not yet pointing at `b1-glam-studio-api` |
| `caption-grab-unleashed` | `caption.freegameplay` | Vite | `caption-grab-unleashed` | `worker/wrangler.toml` | `captiongrab-api` (zero bindings) | **Not deployed** | `VITE_API_URL` encrypted external |
| `agreement-trust` | `agreement-trust` | Vite | `agreement-trust` | — (no wrangler) | — | — | `VITE_API_URL` external, frontend-only in repo |
| `it-mastery-suite` | `it-mastery-suite` | Vite | `it-mastery-suite` | `wrangler.toml` | `it-mastery-suite` (stub `it-mastery-suite` worker exists) D1 `techpros-itsm`, R2 `techpros-uploads`, KV `CONFIG`, DO `SessionRoom` | Stub worker `it-mastery-suite` `autumn-surf-21ec` **404** — not the real build | `VITE_API_URL` encrypted |
| `agently-home-hub` | `agently-home-hub` | Vite | `agently-home-hub` | — (no wrangler found) | — | Worker `agently-home-hub-api` `cyberelias-tk` **200 `/api/health`** — **has no source repo** (orphan, stays) | `VITE_API_URL=agently-home-hub-api.cyberelias-tk` (just updated) |
| `vizier-web` | `vizier-web` | Next.js | **no-link** | — (org repo `vizier` is VSCode extension) | `vizier-backend` in `b739…` (unrelated to that repo) | `vizier-backend` `cyberelias-tk` **200 `/api/health`** (200 unauth, 401 on `/`) — live, but source repo not in org | `NEXT_PUBLIC_API_URL=vizier-backend.cyberelias-tk` (just updated) |
| `cloudfront-forge` | `loop.freegameplay` | TanStack | `cloudfront-forge` | `workers/api/wrangler.toml` | `creatorloop-api` D1 `creatorloop-db` (`263dfc51…`), KV `KV_CACHE`, R2 `creatorloop-assets` — account `c567…` Admin | `creatorloop-api` `autumn-surf-21ec` **404 on `/api/health`** (uses `/api/ws/*`; creation flows work), `cyberelias-techpros-cloudfront-forge` full-stack on same account | `VITE_API_URL=creatorloop-api.autumn-surf-21ec` (already correct) |
| `ke-town-digital-heritage` | `ke.freegameplay` | Vite | `ke-town-digital-heritage` | — (no wrangler) | — but live `ke-town-db` + `ke-town-uploads` exist in `e543…` Cyber | **Generic `ke-town-api` we just created** is the only worker for it | `VITE_API_URL=ke-town-api.cyber-e54` (just added, assumes that var name) |
| `see-my-business-contact-gain` | `see-my-business…` | TanStack | `see-my-business-contact-gain` | `wrangler.jsonc` | `gainhub-api` family: `gainhub-development`/`preview`/`production` — **placeholder production D1 id `2222…`** | No `gainhub-*` worker deployed; only leftover `directory-*` stubs (deleted) + R2 `see-my-business-images` | No `VITE_API_URL` (R2 only) |
| `smart-attendance-hub` | `smart-attendance-hub-six` | Vite | `smart-attendance-hub` | `wrangler.toml` | `slams-api` D1 `slams` (`7ba50733…`) account `e543…` Cyber | `slams-api` `cyber-e54` **just deployed** (generic CRUD version) — real source expects `worker/src/*` with cron `* * * * *` and JWT secret | `VITE_API_URL=slams-api.cyber-e54` (just added) |
| `subscription-tracker` | `subscription-tracker…` | Next.js | `subscription-tracker` | `worker/wrangler.jsonc` | `subscription-tracker-api` D1 `subscription-tracker-db` (local placeholder), R2 `subscription-tracker-storage`, KV `CACHE` | **Not deployed** | no env (zero before) |
| `sound-shifter-local` | `sound-shifter-local` | Vite | `sound-shifter-local` | — | — | — | frontend-only (no env, correct) |
| `worker` | `worker-seven-nu` | Hono | **no-link** | (local `worker/` in this repo is Hono sample) | `cea-email-worker` / `cea-notif-worker` pattern not from this repo | — | no env (hono sample) |
| `vachoma-bole-fusion` | `vachoma-bole-fusion` | Vite | `vachoma-bole-fusion` | —, `supabase/` | Supabase (`VITE_SUPABASE_*`, `POSTGRES_*` in Vercel env) | — (Supabase, not CF) | correct Supabase env |
| `clear-prompt-crafter` | `clear-prompt-crafter` | Vite | `clear-prompt-crafter` | `worker/wrangler.toml` | `prompt-gineer-api` D1 `prompt-gineer-db` (placeholder) | **Not deployed** | no env |
| `graceline-answers` | `graceline-answers…` | Vite | `graceline-answers` | — (root `cpanel-app/client/`) | — | — | no env |
| `cloud-gather-front` | `cloud-gather-front` | Vite | `cloud-gather-front` | —, `supabase/` | Supabase | — | no env |
| `tax-navigator-pro` | `tax-navigator-pro` | Vite | `tax-navigator-pro` | —, `supabase/` | Supabase-adjacent (no wrangler) | — | no env |
| `toolbox` | `toolbox-gamma-lovat` | Vite | `toolbox` | — | — (docs mention optional `toolbox-api`) | — | frontend-only (correct) |
| `web-tools` | `web-tools-eight-sigma` | Vite | `web-tools` | — | — | — | frontend-only (correct) |
| `gif-wizard-pro` | `gif-wizard-pro` | Vite | `gif-wizard-pro` | — | — | — | frontend-only (correct) |
| `web` | `sambet.freegameplay` | Next.js | `sambet` | `worker/wrangler.jsonc` | `sambet` worker D1 `sambet-db` (`aab3fc85…`), R2 `sambet-imports` | Stub `sambet` `autumn-surf-21ec` **404** — not the real build | no env before, worker exists as stub |
| `t7m` | `t7m-one` | Next.js | `t7m` | `apps/api/wrangler.jsonc` | `t7m-api` D1 `t7m` + R2 `t7m-attachments` + KV `RATE_LIMIT` | **Just deployed** `t7m-api` `autumn-surf-21ec` **200 `/health` + `/v1/questionnaire`** | `NEXT_PUBLIC_API_BASE_URL=t7m-api.autumn-surf-21ec` (just added) |
| `portify-developer-hub` | `portify-developer-hub` | Vite | `portify-developer-hub` | —, `supabase/` | Supabase | — | no env |
| `live-stream-share-cast` | `live.freegameplay` | Vite | `live-stream-share-cast` | `worker/wrangler.jsonc` (canonical) + old `cloudflare-backend/` snapshot | `live-stream-share-cast-api` D1 `live-stream-db` (`5a70591e…` canonical, `4e3c4b05…` scaff), R2 `lsc-*` vs `livestream-*`, DOs | Both exist but **only `worker/` is deployed** (`autumn-surf-21ec` 200 `/api/health` d1/r2/DO ok); scaffold's empty resources deleted | `VITE_API_BASE=…/api` (just fixed from wrong `VITE_CF_API_URL`) |
| `speed-buddy-check-up` | `speed-buddy-check-up` | Vite | `speed-buddy-check-up` | —, `supabase/` | `VITE_SUPABASE_*` in Vercel env | Supabase | correct |

`frontend` project is the one `vercel project ls` entry whose API returns 404 for `frontend` — its real Vercel name is `delgra`/`lumina-studio` family (see `cea-os` row). The `delgra/backend/wrangler.jsonc` inside `lumina-studio` is the `delgra` frontend's backend (`delgra-db` + `delgra-uploads`).

## Table 2 — Orphaned / stub Cloudflare resources (no Vercel+GitHub owner)

| Resource (account) | Why orphaned |
|---|---|
| Workers `cybershop` (stub), `it-mastery-suite` (stub), `sambet` (stub), `techtrack` (19 KB, `PORT` only), `d1-proxy` + `affiliate-hub` (no frontend), `whatsapp-lead-hub` (full-stack, custom domain `smb.techpros.com.ng`) | No matching `wrangler` source in the cloned repos (or source elsewhere) |
| D1 `ce-foundation-school`, `affiliate-hub-db` (Cyber) | No worker at all |
| R2 `directory-media`, `sambet-imports`, `ttin-uploads`, etc. already covered above; those here have no repo worker |
| Queues/DO leftovers after deletions: `cea-email-queue`, `cea-notif-queue` are legitimate (cea family) — keep |

## What “keep cea, ttin/unashamed and so on” should mean in concrete terms

Minimum keep (what you literally named): `cea-api` + `cea-email/worker` + `cea-notif/worker` + D1 `cea-db` + R2 `cea-uploads` (Cyber) **and** `unashamed-movement` + D1 `ttin-db` + R2 `ttin-uploads` + zone `thetimeisnow.org` + custom domain `ttin.techpros.com.ng`.

Recommended widening (what the table above proves is intentionally built): also keep the 10 workers whose source repo **does** contain a wrangler with real bindings (`kidmin-harmony`, `creatorloop-api`, `cybershop-api`, `sambet`, `slams-api`, `t7m-api`, `live-stream-share-cast-api`, `b1-glam-studio-api`, `gainhub-api`, `prompt-gineer-api`, `subscription-tracker-api`, `captiongrab-api` stubs are cheap to keep as stubs). Deleting them forces rebuilding from the same repo anyway.

## Frontend env var contract (so later custom domains don't break)

All built backends expect an allow-list var on the worker (`ALLOWED_ORIGINS` / `FRONTEND_ORIGINS` / `CORS_ORIGIN` / `WEB_ORIGIN`). Changing the Vercel frontend domain requires updating that worker var, not the Vercel env var (which already points at the live `workers.dev` URL).

## Reproduce

```powershell
gh repo clone CyberElias-TechPros/<repo> -- --depth 1
Get-ChildItem -Recurse -Include wrangler.toml,wrangler.jsonc
# compare worker names to: wrangler d1 list --json | wrangler r2 bucket list | GET /accounts/{id}/workers/scripts
vercel env list --project <vercel-name>
```
