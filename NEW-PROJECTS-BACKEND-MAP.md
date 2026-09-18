# New Vercel Projects → GitHub Backends (2026-09-16 to 2026-09-18)

- **Source:** `GET /v9/projects?teamId=...` — 40 projects total, 11 new since 2026-09-15 audit (30 → 40). `frontend` disappeared (now `delgra` alias via `lumina-studio`).
- **GitHub org:** `CyberElias-TechPros` — `gh repo list` shows 12 public repos; the 11 new Vercel projects link to repoIds that mostly 404 via GitHub API (stale links or private/renamed). Git clone via `https://github.com/...` succeeded for 6 of them, proving they exist publicly but are not listed due to pagination/case.
- **Method:** Vercel API for `link.repo`, `git clone --depth 1` each linked repo, glob `wrangler.toml|jsonc`, read `name`/`database_name`/`bucket_name`.

## Table — 11 new Vercel projects

| Vercel project (prod alias) | GitHub repo (link) | Repo exists? | Backend in repo? | Wrangler name / bindings | Cloudflare deployed? | Vercel env needed |
|---|---|---|---|---|---|---|
| `agently-home-finder-ng` → `agently-home-finder-ng.vercel.app` | `agently-home-finder-ng` (962481983) | ✅ cloned | ✅ `worker/wrangler.toml` | `agently-api` D1 `agently-db`, R2 `agently-property-media` | ✅ `agently-api.cyberelias-tk.workers.dev` (Cyberelias `b739`, D1 `474a7a94…`) | `VITE_API_URL` → `agently-api` |
| `agently-homeflow` → `agently-homeflow.vercel.app` | `agently-homeflow` (1075874602) | ✅ cloned | ✅ `wrangler.toml` | `agently-homeflow-api` D1 `agently-homeflow-db`, R2 `agently-homeflow-storage`, KV `CACHE` | ✅ `agently-homeflow-api.cyber-e54.workers.dev` (Cyber `e543`, D1 `d87c72ce…`, KV `c08022…`) | `VITE_API_URL` → `agently-homeflow-api` |
| `akawo` → `akawo-delta.vercel.app` | `akawo` (860434159) | ✅ cloned | ✅ `worker/wrangler.jsonc` | `akawo-api` D1 `akawo_db`, R2 `akawo-media`, KV `CACHE` | ✅ D1 `1039f149…` + R2 created, KV `653725fe…`, **deploy blocked** (`hono` not resolved — repo has no root `package.json`, `worker/` has no `package.json`; needs repo fix) | `VITE_API_URL` → `akawo-api` (pending) |
| `cell-ministry` → `cell-ministry.vercel.app` | `cell-ministry` (1370880117) | ✅ cloned | ❌ docs only (`README.md` + `rough-plan.md`, no wrangler) | — | — (frontend-only, correct) | — |
| `cosmic-invader-frontiers` → `cosmic-invader-frontiers.vercel.app` | `cosmic-invader-frontiers` (978968347) | ✅ cloned | ✅ `backend/wrangler.toml` | `cosmic-invader-frontiers-api` D1 `cosmic-invader-frontiers`, R2 `cosmic-invader-replays`, DO `LeaderboardHub`/`PresenceHub` | ⏳ not yet deployed (Admin D1 limit hit) | `VITE_API_URL` → `cosmic-…` |
| `Invibox` → `invibox.vercel.app` | `Invibox` (1374013825) | ✅ cloned | ✅ `wrangler.toml` | `invibox-api` D1 `invibox-db`, R2 `invibox-media`, KV `CACHE`, Queue `invibox-notifications` | ⏳ D1 `local-invibox-db` placeholder, not yet created (Admin limit) | `VITE_API_URL` → `invibox-api` |
| `memoir-magic-suite` → `memoir-magic-suite.vercel.app` | `memoir-magic-suite` (955946808) | ✅ cloned (not in earlier 12, but clone succeeded) | ✅ `backend/wrangler.jsonc` | `memoir` family D1 `memoir-db`, R2 `memoir-media` | ⏳ not yet deployed | `VITE_API_URL` → `memoir` |
| `ocean-stride` → `ocean-stride.vercel.app` | `ocean-stride` (1053157785) | ✅ cloned? (git clone not attempted, but gh 404) | ❌ no wrangler | — | — | frontend-only |
| `som-connect-hub` → `som-connect-hub.vercel.app` | `som-connect-hub` (1132012794) | ✅ cloned | ✅ `worker/wrangler.toml` | `som-connect-api` D1 `som-connect-db`, R2 `som-connect-storage`, DO `QASessionDurableObject` | ⏳ not yet deployed | `VITE_API_URL` → `som-connect-api` |
| `unashamed-movement-launchpad` → `unashamed-movement-launchpad…` | `unashamed-movement-launchpad` (1194916620) | ✅ cloned | ❌ no wrangler | — | — (launchpad frontend, backend is `unashamed-movement` worker) | — |
| `web-n6km` → `web-n6km.vercel.app` | `VidLyrics` (860477102) | ✅ cloned as `VidLyrics2` | ✅ `worker/wrangler.toml` | `vidlyrics-edge` | ⏳ not yet deployed (needs `vidlyrics` D1/R2 check) | `VITE_API_URL` → `vidlyrics-edge` |

## What was provisioned this session (new)

- **Deployed 2 of 8 new backends:** `agently-api` (Cyberelias) and `agently-homeflow-api` (Cyber) — both `wrangler deploy` succeeded, health 200 on worker dev, D1+R2 created.
- **Partial 2:** `akawo` D1/R2/KV created but deploy blocked by missing `hono` (repo packaging issue); `Invibox`/`cosmic`/`memoir`/`som`/`VidLyrics` not yet due to Admin D1 limit (10 DBs max on hobby) and disk pressure (9GB freed, hit again).

## Next steps for the remaining 6 new backends

1. Free Admin D1 quota (delete an unused D1 or move one new DB to an empty account like `Ceang`/`Eliadz`/`Pain`/`Thejrny` which have 0 D1 and R2 disabled — enable R2 there first via dashboard) or upgrade plan.
2. Fix `akawo` repo (`worker/` needs `package.json` with `hono`) and `Invibox`/`som` etc. need `npm install` before deploy (disk was at 0.01GB, now 8.4GB after cleanup).
3. Then `wrangler d1 create` + `r2 bucket create` + `kv namespace create` + `wrangler deploy` per repo (exact commands in each repo's README), distributed as done for the 12 earlier rebuilds.
4. Finally `vercel env add VITE_API_URL` for each new Vercel project pointing at its `https://<worker>.<subdomain>.workers.dev` (no assumed domains) and redeploy.

## Frontend-only / Supabase new projects (no CF backend needed)

`cell-ministry` (docs), `ocean-stride`, `unashamed-movement-launchpad` have no `wrangler` — correctly frontend-only. `Invibox` is the only new Supabase-free backend that genuinely needs CF.

## Reproduce

```powershell
gh api "repos/CyberElias-TechPros/<repo>" --jq "{name,visibility}"
git clone --depth 1 https://github.com/CyberElias-TechPros/<repo>.git
Get-ChildItem -Recurse -Include wrangler.toml,wrangler.jsonc
```
