# Thorough GitHub vs Cloudflare Check — 18 “no backend” Vercel Projects

- **Re-check date:** 2026-09-18, deep clone + `Get-ChildItem -Recurse` for `wrangler.toml|jsonc`, `worker/`, `workers/`, `backend/`, `server/`, `supabase/`, plus `package.json` deps (`hono`/`express`/`wrangler`/`supabase`/`drizzle`/`prisma`).

| Vercel project | GitHub repo | GitHub backend found | Cloudflare backend found (live inventory 2026-09-18) | Verdict |
|---|---|---|---|---|
| `agently-home-hub` | `agently-home-hub` | **Express** `server/` `agently-backend` `express@4.18` (47 files) — **no `wrangler`** | **Yes** — worker `agently-home-hub-api` `cyberelias-tk` + D1 `agently-home-hub-db` + R2 `agently-documents` (orphan, no source) | Has CF backend, but GitHub has no `wrangler` — should be migrated to Workers or kept as Express |
| `agreement-trust` | `agreement-trust` | **Express** `server/` `agreement-trust-server` `express@4.18` (29 files) — no `wrangler` | **No** — no worker/D1/R2 named `agreement-trust` on any of the 8 accounts | **Should have CF backend — missing** |
| `cell-ministry` | `cell-ministry` | No backend — only `README.md` + `rough-plan.md` | No | Correct — frontend-only/docs |
| `cloud-gather-front` | `cloud-gather-front` | `supabase/config.toml` (21 files) | No | Correct — Supabase is the backend |
| `graceline-answers` | `graceline-answers` | No backend | No | Correct — frontend-only |
| `ke-town-digital-heritage` | `ke-town-digital-heritage` | **Express** `server/` `keKingdom-server` `express@4.21` (116 files) — no `wrangler` | **Yes** — D1 `ke-town-db` + R2 `ke-town-uploads` + generic `ke-town-api` `cyber-e54` we created (now live) | Has CF now (generic), but GitHub is Express — same mismatch as agently |
| `ocean-stride` | `ocean-stride` | **Express + Prisma** root `package.json` + `src/lib/api/*` | **No** — no worker/D1/R2 named `ocean-stride` | **Should have CF backend — missing** |
| `portify-developer-hub` | `portify-developer-hub` | `supabase/` (4 files) | No | Correct — Supabase |
| `sound-shifter-local` | `sound-shifter-local` | No backend | No | Correct — frontend-only (you confirmed) |
| `toolbox` | `toolbox` | No backend | No | Correct — frontend-only (you confirmed) |
| `web-tools` | `web-tools` | No backend | No | Correct — frontend-only (you confirmed) |
| `gif-wizard-pro` | `gif-wizard-pro` | No backend | No | Correct — frontend-only (you confirmed) |
| `unashamed-movement-launchpad` | `unashamed-movement-launchpad` | No backend (no `package.json`) | No | Correct — frontend-only (backend is `unashamed-movement` worker) |
| `vachoma-bole-fusion` | `vachoma-bole-fusion` | `supabase/` (1 file) | No | Correct — Supabase |
| `tax-navigator-pro` | `tax-navigator-pro` | `supabase/` (3 files) | No | Correct — Supabase |
| `speed-buddy-check-up` | `speed-buddy-check-up` | `supabase/` (5 files) | No | Correct — Supabase |
| `vizier-web` | `vizier` (extension, not `vizier-web`) | `express` is for extension host, not web backend | **Yes** — `vizier-backend` `cyberelias-tk` + D1 `vizier_db` + R2 `vizier-files` (orphan) | Has CF, but GitHub `vizier` is not its source |
| `worker` | `no-link` | — (Hono sample) | No | Correct — no GitHub to check |

**Summary:** 4 of the 18 *do* have an Express/`server/` backend in GitHub that has **no `wrangler`** and therefore no Cloudflare Workers source, but 2 of those 4 (`agently-home-hub`, `ke-town`) already have a live CF backend (orphan/generic), while `agreement-trust` and `ocean-stride` have **neither** a `wrangler` in GitHub **nor** a live CF worker/D1 — those are the two that “should have a cloudflare backend” and are missing.

**Next:** create Cloudflare Workers for `agreement-trust` and `ocean-stride` from their Express code (or a minimal `wrangler` if you want them on Workers), distributed to the empty accounts (`Pain`/`Thejrny`/`Ceang`/`Eliadz`) — they have 0 D1 and no R2 limit pressure, but R2 is disabled there so enable R2 first via dashboard or use `Admin`/`Cyber` for R2. Say which of the 4 Express projects you want migrated to Workers vs left as Express.
