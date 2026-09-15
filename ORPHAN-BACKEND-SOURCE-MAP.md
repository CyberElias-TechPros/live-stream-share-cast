# Orphaned Backends → GitHub Source Map (fields × repos)

- **Audit date (UTC):** 2026-09-15
- **Method:** (1) downloaded all 27 worker bundles and extracted field fingerprints: `env.*` bindings, route paths, SQL table names, queue/bucket names, app titles; (2) shallow-cloned all 7 code-bearing org repos (`cell-ministry`, `cea-os`, `vizier`, `t7m`, `toolbox`, `vachoma-bole-fusion`, `naija-bake-connect`) and grepped for `wrangler.toml`, worker/D1/R2/KV names and the fingerprint strings; (3) `gh search code` (hit rate limits — local clones used instead).
- **Follows:** `CLOUDFLARE-BACKEND-FRONTEND-LINKS-REPORT.md` (frontend targets), `VERCEL-CLOUDFLARE-CROSSREF-REPORT.md`.

## Headline: most deployed backends have NO source repo in `CyberElias-TechPros`

Only **one** deployed backend maps to an org repo (`cea-*` ↔ `cea-os`). The rest were deployed from elsewhere (other accounts, local machines, or deleted repos).

## ✅ Mapped to a repo

| Cloudflare backend | GitHub repo | Evidence |
|---|---|---|
| `cea-api` + `cea-email-worker` + `cea-notif-worker` + D1 `cea-db` + queues `cea-email/notif-queue` (+ KV/R2 in code) | `CyberElias-TechPros/cea-os` | `workers/api|email|notif/wrangler.toml` with `name = "cea-api"` (email/notif named `cea-email`/`cea-notif` in repo — deployed names drifted to `*-worker`), D1 `cea-db`, queues `cea-email-queue`/`cea-notif-queue` |
| `live-stream-share-cast` future backend | `CyberElias-TechPros/live-stream-share-cast` → `cloudflare-backend/` | Built in this repo (not deployed yet) |
| t7m backend spec (NOT deployed) | `CyberElias-TechPros/t7m` → `apps/api/wrangler.jsonc` | Expects worker `t7m-api` + D1 `t7m` + R2 `t7m-attachments` + KV `RATE_LIMIT` — **none exist on Cloudflare** |

## 🔶 Identified by fields, no repo in org (source lives elsewhere)

| Cloudflare backend | Field fingerprint (from bundle) | Belongs where |
|---|---|---|
| `kidmin-harmony` + D1 `kidmin-harmony-db` + R2 `kidmin-harmony-media` | Tables `children`, `attendance_sessions/records`, `lessons`, `events`; titles "Bible Camp", "Summer Bible School", "Noah", "Good Samaritan"; `SEED_DEMO` binding | Children's ministry app = Vercel `kids-ministry`. No repo in org — source elsewhere |
| `ministry-api` + D1 `ministry-db` + R2 `ministry-assets` | Tables `zones`, `groups`, `subgroups`, `churches`, `submissions`, `report_cycles`, `meetings`, `broadcasts`, `curricula`, `movies`, `prayer_slots`; KV + R2 bindings | Zone/church ministry-reporting platform (same family as kids-ministry, possibly its admin backend). No repo in org |
| `affiliate-hub` + D1 `affiliate-hub-db` | Tables `affiliate_links`, `referrals`, `transactions`, `withdrawals`, `products`, `achievements`, `streaks`; `CONVERSION_WEBHOOK_SECRET` | Affiliate-marketing backend. No repo, no Vercel frontend found |
| `cybershop` (stub) + `cybershop-api` + D1 `cybershop` | Tables `businesses`, `listings`, `offers`, `subscriptions`, `payments`, `whatsapp_numbers`, `media`; `INTERNAL_SECRET`, `SESSION_*`, `MEDIA_*` | Marketplace/directory backend = Vercel `cybershop-web` (`WORKER_URL` env). No repo in org |
| `creatorloop-api` (+production) + D1 `creatorloop-db` + R2 `creatorloop-assets` + KV `creatorloop-api-KV_CACHE` | YouTube OAuth, `watch_sessions`, XP/credits, `reviews`, `communities`, push subscriptions; `frontendUrl loop.freegameplay.site` | LoopSquad creator-growth backend = `loop.freegameplay.site` (Vercel `cloudfront-forge`). No repo in org |
| `unashamed-movement` + D1/R2 `ttin-*` | `site_url thetimeisnow.org`, `noreply@thetimeisnow.org`, custom domain `ttin.techpros.com.ng` | `thetimeisnow.org` (external). No repo in org |
| `whatsapp-lead-hub` (×2) | Self-served "WhatsApp Lead Hub" SPA + `/webhooks/whatsapp`, custom domain `smb.techpros.com.ng` | Standalone full-stack (see-my-business orbit). No repo in org |
| `delgra` + D1 `delgra-db` + R2 `delgra-uploads` | Hono API, `APP_URL`-based origins | Vercel `frontend` (`delgra.freegameplay.site`). No repo in org |
| `sambet` (stub) + D1 `sambet-db` + R2 `sambet-imports` | Stub (~1 KB) — storage is the real footprint | Vercel `web` (`sambet.freegameplay.site`). Source elsewhere |
| `agently-home-hub-api` + D1 + R2 `agently-documents` | Hono API | Vercel `agently-home-hub`. No repo in org |
| `vizier-backend` + D1 `vizier_db` + R2 `vizier-files` + queues | `ALLOWED_ORIGINS vizier-web.vercel.app` | Vercel `vizier-web`. **Repo `vizier` is a VSCode extension — zero references to any of these; name collision, NOT the source** |
| `it-mastery-suite` (stub) | ~1 KB, no fields | Vercel `it-mastery-suite` by name only — verify live |
| `ke-town-db` + `ke-town-uploads` | Name match only | Vercel `ke-town-digital-heritage`. No repo in org |
| `techtrack` (19 KB) | Only `PORT` binding, localhost URL | Purpose unclear — no repo, no frontend. Candidate for deletion review |
| `d1-proxy` (22 KB) | Generic D1 proxy (`linkedBinding`, `DB`) | Infra — check consumer workers' bindings before touching |
| `ce-foundation-school` (D1 only) | Name only | Thematic fit: `cell-ministry` repo plans Foundation-School tracking, but the repo is docs-only with **no code references** — weak link, treat as unclaimed |

## Repos without a deployed backend

| Repo | Backend state |
|---|---|
| `t7m` (`apps/api`) | Fully specified (`t7m-api` + D1 `t7m` + R2 `t7m-attachments` + KV) but **nothing deployed** — provisioning task open |
| `toolbox` | No backend code (docs mention an optional `toolbox-api`; frontend-only per owner) |
| `vachoma-bole-fusion`, `naija-bake-connect` | Supabase-only (`supabase/` dirs) — no Cloudflare footprint by design |
| `cell-ministry` | Planning docs only (`rough-plan.md`) — no code, no deployments |
| `vizier` | Unrelated extension — does not source `vizier-backend`/`vizier-web` |

## Vercel ↔ repo sanity check (org only)

Mapped: `live-stream-share-cast`, `toolbox`, `vachoma-bole-fusion`, `t7m`, `cea-os` (→ `www.cea.ng`). The other 25 Vercel projects have no org repo — sources are elsewhere. `naija-bake-connect` and `cell-ministry` repos have no Vercel project in the audited scope.

## Follow-ups left open (need a decision)

1. `directory-prod` D1 + `directory-media` R2 remain orphaned storage after the `directory-api` worker deletion — delete or keep for `see-my-business-contact-gain`?
2. `techtrack` — no repo, no frontend, 19 KB — delete candidate.
3. `t7m` backend (`t7m-api` + D1 `t7m` + R2 `t7m-attachments` + KV) — provision from `t7m/apps/api/wrangler.jsonc`?
4. `vizier-backend`/`vizier-web` source repo is missing — locate before any refactor.
