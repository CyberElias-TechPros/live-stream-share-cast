# Vercel ↔ Cloudflare Cross-Reference — Which Vercel Projects Already Have a Cloudflare Backend?

- **Sources:** `VERCEL-AUDIT-REPORT.md` (30 Vercel projects, env vars, framework) + `CLOUDFLARE-AUDIT-REPORT.md` (8 CF accounts: 27 Workers, 0 Pages, 23 D1, 17 R2, 32 KV, 8 Queues, 13 zones).
- **Audit date (UTC):** 2026-09-15
- **Method:** normalized name matching (`lowercase, strip -/_`, exact → substring → token overlap) across Workers/D1/R2/KV names, **plus** hard evidence: Vercel production URL containing the backend name (e.g. `delgra.freegameplay.site` → `delgra` worker) and Vercel env vars (`WORKER_URL`, `VITE_API_URL`). Generic-token hits (e.g. Vercel `worker` ↔ `cea-email-worker` on the word "worker") were rejected as false positives. A match needs either an exact/substring name hit or URL/env evidence.

## Headline

| Status | Count |
|---|---|
| ✅ Has Cloudflare backend | 10 |
| ⚠️ Partial (storage only, no worker) | 1 |
| 🖥️ Frontend-only by design (confirmed, no backend needed) | 4 |
| ❌ No Cloudflare backend | 15 |

## ✅ Vercel projects WITH a Cloudflare backend (10)

| Vercel project | Vercel URL | Cloudflare backend (account) | Evidence |
|---|---|---|---|
| frontend | https://delgra.freegameplay.site | Worker `delgra` + D1 `delgra-db` + R2 `delgra-uploads` + KV `delgra-rate-limit` (Admin) | Prod URL slug = worker name; `VITE_API_URL`/`API_URL` env set |
| cea-os | https://www.cea.ng | Workers `cea-api`, `cea-email-worker`, `cea-notif-worker` + D1 `cea-db` + R2 `cea-avatars/course-files/documents/uploads` + KV `cea-rate-limit`, `cea-assessment-*` + Queues `cea-email-queue`, `cea-notif-queue` (Cyber + Info) | `VITE_API_URL` + `VITE_WS_URL` env; name prefix `cea` |
| cybershop-web | https://shop.freegameplay.site | Workers `cybershop`, `cybershop-api` + D1 `cybershop` (Admin, Info) | `WORKER_URL` + `WORKER_INTERNAL_SECRET` env — explicit worker wiring |
| kids-ministry | https://kids-ministry-murex.vercel.app | Worker `kidmin-harmony` + D1 `kidmin-harmony-db` + R2 `kidmin-harmony-media` + `ministry-api` / `ministry-db` / `ministry-assets` / `ministry-cache` (Admin, Cyber) | `kidmin` ≈ kids-ministry; `JWT_SECRET` env; ministry-* triple (worker+D1+R2) |
| web | https://sambet.freegameplay.site | Worker `sambet` + D1 `sambet-db` + R2 `sambet-imports` (Admin) | Prod URL slug = worker name |
| agently-home-hub | https://agently-home-hub.vercel.app | Worker `agently-home-hub-api` + D1 `agently-home-hub-db` + R2 `agently-documents` (Cyberelias.tk) | Exact name match; `VITE_API_URL` env |
| vizier-web | https://vizier-web.vercel.app | Worker `vizier-backend` + D1 `vizier_db` + R2 `vizier-files` + KV `vizier-kv-prod` + Queues `vizier-tasks`, `vizier-dlq` (Cyberelias.tk) | `NEXT_PUBLIC_API_URL`/`WS_URL` + `JWT_SECRET` env; full stack (worker+D1+R2+KV+queues) |
| it-mastery-suite | https://it-mastery-suite.vercel.app | Worker `it-mastery-suite` (Admin) | Exact worker-name match |
| cloudfront-forge | https://loop.freegameplay.site | Worker `cyberelias-techpros-cloudfront-forge` (Admin) | `cloudfront-forge` substring of worker name; `VITE_API_URL` env |
| ke-town-digital-heritage | https://ke.freegameplay.site | D1 `ke-town-db` + R2 `ke-town-uploads` (Cyber) | `ke-town` name match (no worker — data layer only, no Vercel env) |

## ⚠️ Partial (1)

| Vercel project | What exists on Cloudflare | Gap |
|---|---|---|
| see-my-business-contact-gain | R2 `see-my-business-images` (Cyber) | No worker, no D1 — frontend-only + images bucket |

## 🖥️ Frontend-only by design (4, confirmed — no backend needed)

| Vercel project | Vercel URL | Why no backend |
|---|---|---|
| sound-shifter-local | https://sound-shifter-local.vercel.app | Pure client-side audio tool; zero env, all logic in browser |
| toolbox | https://toolbox-gamma-lovat.vercel.app | Client-side utilities collection; zero env |
| web-tools | https://web-tools-eight-sigma.vercel.app | Client-side web tools; zero env |
| gif-wizard-pro | https://gif-wizard-pro.vercel.app | Client-side GIF maker; zero env |

## ❌ No Cloudflare backend (15)

| Vercel project | Vercel backend state | Note |
|---|---|---|
| caption-grab-unleashed | `VITE_API_URL` only (external) | Points outside CF; no CF resource matches |
| b1-glam-studio | `JWT_SECRET` etc., no CF match | Backend env exists but is not Cloudflare |
| live-stream-share-cast | zero Vercel env (Supabase keys hardcoded in `src/integrations/supabase/client.ts`) | External Supabase backend; **no CF equivalent yet — covered by new `cloudflare-backend/` in this repo (not deployed)** |
| agreement-trust | `VITE_API_URL` only (external) | No CF match |
| subscription-tracker | zero env | No backend anywhere |
| smart-attendance-hub | zero env | No backend anywhere |
| worker | zero env (Hono app) | Generic-name hits (`cea-email-worker`) rejected — no real match |
| vachoma-bole-fusion | Full Supabase + Postgres env | Backend is Supabase, not Cloudflare |
| clear-prompt-crafter | zero env | No backend anywhere |
| graceline-answers | zero env | No backend anywhere |
| cloud-gather-front | zero env | No backend anywhere |
| tax-navigator-pro | zero env | No backend anywhere |
| speed-buddy-check-up | Supabase env | Backend is Supabase, not Cloudflare |
| t7m | zero env | `ttin-db`/`ttin-uploads` noted but `ttin` ≠ `t7m` — no confident match |
| portify-developer-hub | zero env | No backend anywhere |

## Priority: no backend anywhere (neither Vercel env, nor Supabase/Firebase, nor Cloudflare)

`subscription-tracker`, `smart-attendance-hub`, `worker`, `clear-prompt-crafter`, `graceline-answers`, `cloud-gather-front`, `tax-navigator-pro`, `t7m`, `portify-developer-hub` — 9 projects with zero env vars and zero CF footprint. Best candidates for the next Cloudflare backend (same Workers+D1+R2 pattern as `cloudflare-backend/`).

## Orphaned Cloudflare backends (no Vercel project match)

`creatorloop-*` (api, db, assets), `directory-*` (api, prod db, media), `curate` + `curate-raw` + `curate-ingest` queues, `slams`, `ce-foundation-school`, `affiliate-hub` (+db), `business-pulse`, `stellar-launchpad-*`, `ttin-*`, `techtrack`, `unashamed-movement`, `moviesmod`, `whatsapp-lead-hub` (workers + D1 in 3 accounts), `d1-proxy`, `cea-email/notif-workers` (shared infra). These likely back non-Vercel frontends or retired projects — verify before reuse to avoid collisions.

## Reproduce

```powershell
vercel env list --project <name>
$env:CLOUDFLARE_ACCOUNT_ID="<account-id>"; wrangler d1 list --json; wrangler r2 bucket list; wrangler kv namespace list
# GET https://api.cloudflare.com/client/v4/accounts/{id}/workers/scripts
```
Name-match script used for the first pass: `xref.js` (normalize → exact → substring → token overlap; manual review for URL/env evidence and false-positive rejection).
