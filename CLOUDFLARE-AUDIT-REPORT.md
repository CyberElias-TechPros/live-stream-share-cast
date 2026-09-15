# Cloudflare Audit — All Accounts (Workers, Pages, D1, R2, KV, Queues, Zones)

- **Login:** `info@techpros.com.ng` (OAuth, `wrangler whoami`)
- **Audit date (UTC):** 2026-09-15
- **Method:** `wrangler d1 list --json` + `wrangler r2 bucket list` + `wrangler kv namespace list` + `wrangler queues list` + `wrangler vectorize list` + `wrangler hyperdrive list` + `wrangler pages project list` per account via `CLOUDFLARE_ACCOUNT_ID`, plus API `GET /accounts/{id}/workers/scripts` and `GET /zones?account.id={id}`.
- **Accounts scanned:** 8

## Totals

| Resource | Total |
|---|---|
| Workers (scripts) | 24 (27 before deletions on 2026-09-15) |
| Pages projects | 0 (none in any account) |
| D1 databases | 20 (23 before deletions) |
| R2 buckets | 15 (17 before deletions; 5 accounts have R2 not enabled: `Ceang`, `Eliadztech`, `Info`, `Pain`, `Thejrny` return API 10042) |
| KV namespaces | 32 |
| Queues | 6 (8 before deletions) |
| Vectorize indexes | 0 |
| Hyperdrive configs | 0 |
| Zones | 13 |

> **Deletions on 2026-09-15:** workers `directory-api` (Admin + Info) and `moviesmod` (Eliadztech); D1 `business-pulse`, `stellar-launchpad-db`, `curate` (Cyber); R2 `curate-raw`, `stellar-launchpad-uploads` (both empty, Cyber); queues `curate-ingest`, `curate-ingest-dlq` (Cyber). `slams` D1 kept — belongs to `smart-attendance-hub`.

## Per-account breakdown

### 1. Admin@naijaearnings.com.ng's Account — `c567f93a5269d713595b68c75f8f33c5`
- Workers (9): `creatorloop-api`, `creatorloop-api-production`, `cyberelias-techpros-cloudfront-forge`, `cybershop`, `delgra`, `it-mastery-suite`, `kidmin-harmony`, `sambet`, `whatsapp-lead-hub` (`directory-api` deleted 2026-09-15)
- Pages: 0
- D1 (6): `kidmin-harmony-db`, `sambet-db`, `delgra-db`, `creatorloop-db`, `directory-prod`, `whatsapp-lead-hub`
- R2 (5): `creatorloop-assets`, `delgra-uploads`, `directory-media`, `kidmin-harmony-media`, `sambet-imports`
- KV (8): `creatorloop-api-KV_CACHE`, `delgra-rate-limit`, `FEATURE_FLAGS`, `POPULAR_SEARCHES`, `RATE_LIMIT`, `SEARCH_CACHE`, `SESSION_CACHE`, `SESSIONS`
- Queues: 0 | Vectorize: 0 | Hyperdrive: 0
- Zones (1): `grandtokyuhotels.com` (active)

### 2. Ceang@techpros.com.ng's Account — `289175720a30033010f7d376dbb99792`
- Workers: 0 | Pages: 0 | D1: 0 | KV: 0 | Queues: 0 | Vectorize: 0 | Hyperdrive: 0
- R2: not enabled (API 10042 — enable in dashboard)
- Zones (1): `cea.ng` (active)

### 3. Cyberelias.tk@gmail.com's Account — `b7399f904cf2b63772526dd43507f630`
- Workers (5): `agently-home-hub-api`, `techtrack`, `unashamed-movement`, `vizier-backend`, `whatsapp-lead-hub`
- Pages: 0
- D1 (4): `agently-home-hub-db`, `vizier_db`, `whatsapp-lead-hub`, `ttin-db`
- R2 (3): `agently-documents`, `ttin-uploads`, `vizier-files`
- KV (4): `CACHE`, `KV`, `SESSIONS`, `vizier-kv-prod`
- Queues (2): `vizier-dlq`, `vizier-tasks`
- Vectorize: 0 | Hyperdrive: 0
- Zones (3): `coursity.com.ng`, `maracre.com.ng`, `techpros.com.ng` (all active)

### 4. Cyber@techpros.com.ng's Account — `e543b6a0521fc8fd76447ceba097b665`
- Workers (6): `affiliate-hub`, `cea-api`, `cea-email-worker`, `cea-notif-worker`, `d1-proxy`, `ministry-api`
- Pages: 0
- D1 (7): `cea-db`, `ministry-db`, `ke-town-db`, `whatsapp-lead-hub`, `slams` (belongs to `smart-attendance-hub`), `ce-foundation-school`, `affiliate-hub-db` (`curate`, `business-pulse`, `stellar-launchpad-db` deleted 2026-09-15)
- R2 (7): `cea-avatars`, `cea-course-files`, `cea-documents`, `cea-uploads`, `ke-town-uploads`, `ministry-assets`, `see-my-business-images` (`curate-raw`, `stellar-launchpad-uploads` deleted 2026-09-15, both were empty)
- KV (12): `CACHE`, `CACHE_KV`, `cea-assessment-OTP_STORE`, `cea-assessment-SESSIONS`, `cea-rate-limit`, `CIRCUIT_BREAKER_KV`, `FLAGS`, `ministry-cache`, `RATE_LIMIT_KV`, `SESSIONS`, `worker-CACHE_KV`, `worker-SESSION_KV`
- Queues (2): `cea-email-queue`, `cea-notif-queue` (`curate-ingest`, `curate-ingest-dlq` deleted 2026-09-15)
- Vectorize: 0 | Hyperdrive: none configured
- Zones (2): `freegameplay.site`, `slyelevators.com` (active)

### 5. Eliadztech@gmail.com's Account — `63a08cfca1bff559bf682dcf2a3eafed`
- Workers: none (`moviesmod` deleted 2026-09-15)
- Pages: 0 | D1: 0 | KV: 0 | Queues: 0 | Vectorize: 0 | Hyperdrive: 0
- R2: not enabled (API 10042)
- Zones: 0

### 6. Info@techpros.com.ng's Account — `ccb3266ecc6459c52ea1236c173107e2`
- Workers (4): `cea-api`, `cea-email-worker`, `cea-notif-worker`, `cybershop-api` (`directory-api` deleted 2026-09-15)
- Pages: 0
- D1 (3): `cybershop`, `cea-db`, `directory-prod`
- R2: not enabled (API 10042)
- KV (8): `FEATURE_FLAGS`, `POPULAR_SEARCHES`, `RATE_LIMIT`, `SEARCH_CACHE`, `SESSION_CACHE`, `worker-CACHE_KV`, `worker-SESSION_KV`, `worker-SESSION_KV_preview`
- Queues (2): `cea-email-queue`, `cea-notif-queue`
- Vectorize: 0 | Hyperdrive: 0
- Zones (2): `gracehubs.com` (moved), `nashvilleestatehub.com` (moved)

### 7. Pain@techpros.com.ng's Account — `ba3a0c06ca86c6e61d2c6b0350abb80b`
- Workers: 0 | Pages: 0 | D1: 0 | KV: 0 | Queues: 0 | Vectorize: 0 | Hyperdrive: 0
- R2: not enabled (API 10042)
- Zones (3): `chemicalsolutionupdate.com`, `painpointsolutions.com.ng`, `trendee.com.ng` (active)

### 8. Thejrny@techpros.com.ng's Account — `5811dd42c9cd0cbd486232e27d22dfc1`
- Workers: 0 | Pages: 0 | D1: 0 | KV: 0 | Queues: 0 | Vectorize: 0 | Hyperdrive: 0
- R2: not enabled (API 10042)
- Zones (1): `thejrny.com.ng` (active)

## Notes
- No Pages projects exist in any account — all frontends are on Vercel (see `VERCEL-AUDIT-REPORT.md`).
- No Vectorize indexes and no Hyperdrive configs in any account.
- R2 is fully enabled only on `Admin`, `Cyberelias.tk`, `Cyber@techpros`. Enable via Cloudflare dashboard for the other 5 accounts if needed.
- Empty accounts (no workers/storage): `Ceang`, `Pain`, `Thejrny` hold only zones.
- Raw CLI/API output is noisy; counts above are deduplicated from `--json` / API `result[].id|name` fields.

## Reproduce
```powershell
wrangler whoami
$env:CLOUDFLARE_ACCOUNT_ID="<account-id>"
wrangler d1 list --json
wrangler r2 bucket list
wrangler kv namespace list
wrangler queues list
wrangler vectorize list
wrangler hyperdrive list
wrangler pages project list
# workers + zones via API with the wrangler OAuth token:
# GET https://api.cloudflare.com/client/v4/accounts/{id}/workers/scripts
# GET https://api.cloudflare.com/client/v4/zones?account.id={id}
```
