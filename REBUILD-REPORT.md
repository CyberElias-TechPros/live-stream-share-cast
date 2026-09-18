# Rebuild Report — Deleted & Recreated Backends (2026-09-18)

- **Kept intact (3):** `cea-*` family (cea-api + email + notif + D1 `cea-db` + R2 `cea-uploads` + KV/queues), `cloudfront-forge` → `creatorloop-api` (D1 `creatorloop-db`, R2 `creatorloop-assets`), `cybershop-web` → `cybershop-api` (D1 `cybershop`)
- **Deleted then rebuilt from GitHub (11 workers, 9 D1, 6 R2, 3 KV, distributed):**

| Worker (Vercel front → GitHub repo) | New Cloudflare URL (account) | D1 | R2 | KV/DO | Deploy status | Vercel env updated |
|---|---|---|---|---|---|---|
| `kids-ministry` → `kidmin-harmony` | `kidmin-harmony.autumn-surf-21ec.workers.dev` (Admin `c567`) | `kidmin-harmony-db` new `d00bcf1f…` | `kidmin-harmony-media` | — | ✅ 200 | `VITE_API_URL` already pointed, kept |
| `frontend`/`delgra` → `lumina-studio/delgra` | `delgra.autumn-surf-21ec.workers.dev` (Admin) | `delgra-db` new `dedf269d…` | `delgra-uploads` | KV `RATE_LIMIT` | ✅ 200 | `frontend.VITE_API_URL` already `delgra…` |
| `web` → `sambet` | `sambet-api.autumn-surf-21ec.workers.dev` (Admin) — **name changed from `sambet` to `sambet-api`** | `sambet-db` new `12c91ca9…` | `sambet-imports` | — | ✅ | `web.VITE_API_URL=sambet-api…` (new) |
| `smart-attendance-hub` → `smart-attendance-hub` | `slams-api.cyber-e54.workers.dev` (Cyber `e543`) | `slams` new `6484419d…` | — | — | ✅ 200 | `VITE_API_URL=slams-api…` already |
| `t7m` → `t7m` | `t7m-api.autumn-surf-21ec.workers.dev` (Admin) | `t7m` new `4d79433d…` | `t7m-attachments` | KV `t7m-RATE-LIMIT` | ✅ `/health`+`/v1/questionnaire` 200 | `NEXT_PUBLIC_API_BASE_URL=t7m-api…` already |
| `live-stream-share-cast` → `live-stream-share-cast/worker` | `live-stream-share-cast-api.autumn-surf-21ec.workers.dev` (Admin) | `live-stream-db` new `101e2cfe…` | `lsc-recordings`/`lsc-avatars` | DO `ChatRoom`/`SignalRoom` | ✅ `/api/health` d1/r2/DO ok | `VITE_API_BASE=…/api` already |
| `b1-glam-studio` → `b1-glam-studio` | `b1-glam-studio-api.cyberelias-tk.workers.dev` (Cyberelias `b739`) | `b1_glam_db` new `5bd6b9af…` | `b1-glam-media` | KV `CACHE_KV` | ✅ | `VITE_API_URL=b1-…cyberelias-tk` (new) |
| `caption-grab-unleashed` → `caption-grab-unleashed` | `captiongrab-api.cyber-e54.workers.dev` (Cyber) | — | — | — | ✅ | `VITE_API_URL=captiongrab…` (new) |
| `clear-prompt-crafter` → `clear-prompt-crafter` | `prompt-gineer-api.autumn-surf-21ec.workers.dev` (Admin) | `prompt-gineer-db` new `38d5f799…` | — | — | ✅ 200 | `VITE_API_URL=prompt-gineer…` (new) |
| `subscription-tracker` → `subscription-tracker` | `subscription-tracker-api.autumn-surf-21ec.workers.dev` (Admin) | `subscription-tracker-db` new `ef6b3291…` | `subscription-tracker-storage` | KV `CACHE` | ✅ 200 | `VITE_API_URL=subscription…` (new) |
| `see-my-business-contact-gain` → `see-my-business-contact-gain` | `gainhub-api-production.cyberelias-tk.workers.dev` (Cyberelias) | `gainhub-production` new `4e87c945…` | `gainhub-evidence-production` | — | ✅ | `VITE_API_URL=gainhub…` (new) |
| `it-mastery-suite` → `it-mastery-suite` | `it-mastery-suite.cyber-e54.workers.dev` (Cyber) | `techpros-itsm` new `da8a79a0…` | `techpros-uploads` | KV `CONFIG` | ✅ 200 | `VITE_API_URL` updated |

**Note on delgra/cea swap you flagged:** `lumina-studio` repo legitimately contains **two** backends (`backend/` for `cea-api` and `delgra/backend/` for `delgra`). Both now live on their correct workers — no replacement, just both kept. `frontend` (alias `delgra.freegameplay.site`) points at `delgra`, `cea-os` (`www.cea.ng`) points at `cea-api`.

**Distribution across accounts (as requested):**
- Admin (`autumn-surf-21ec`, `c567`): kidmin, delgra, sambet-api, t7m, live-stream, clear, subscription (7)
- Cyber (`cyber-e54`, `e543`): captiongrab, it-mastery, slams (3)
- Cyberelias.tk (`cyberelias-tk`, `b739`): b1-glam, gainhub (2)
- Kept: cea family (Cyber + Info), creatorloop (Admin), cybershop (Info)
- Unchanged: ttin/unashamed (`unashamed-movement`) and other Supabase/frontend-only projects

**All Vercel env vars now point at verified `workers.dev` URLs (no assumed domains).** Redeploy each Vercel project for the new values to take effect. Custom domains added later only need the corresponding worker's allow-list (`ALLOWED_ORIGINS`/`FRONTEND_ORIGINS`/`CORS_ORIGIN`) extended — no Vercel var change.

Secrets for rebuilt workers are in each repo's `.dev.vars.example` (JWT etc.) — set via `wrangler secret put` per repo README if needed.
