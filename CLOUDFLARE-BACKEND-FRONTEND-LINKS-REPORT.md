# Cloudflare Backends → Frontend Target Links (incl. orphan review)

- **Audit date (UTC):** 2026-09-15
- **Method:** for each of the 27 worker slots (22 unique names, 5 active accounts): workers.dev subdomain per account, account custom domains (`/accounts/{id}/workers/domains`), zone routes (`/zones/{id}/workers/routes`), full script download + URL/origin-marker grep (`FRONTEND_URL`, `ALLOWED_ORIGINS`, `SITE_URL`, `APP_URL`, redirects, hardcoded `https://` hosts).
- **Follows:** `VERCEL-CLOUDFLARE-CROSSREF-REPORT.md`, which labeled several backends "orphaned".

## Access map (applies to every worker)

| Account | workers.dev subdomain | Default worker link pattern | Custom domains | Zone routes |
|---|---|---|---|---|
| Admin (`c567…`) | `autumn-surf-21ec` | `https://<worker>.autumn-surf-21ec.workers.dev` | none | none |
| Cyberelias.tk (`b739…`) | `cyberelias-tk` | `https://<worker>.cyberelias-tk.workers.dev` | `ttin.techpros.com.ng` → `unashamed-movement`; `smb.techpros.com.ng` → `whatsapp-lead-hub` | none |
| Cyber (`e543…`) | `cyber-e54` | `https://<worker>.cyber-e54.workers.dev` | none | none |
| Eliadztech (`63a0…`) | `eliadztech` | `https://<worker>.eliadztech.workers.dev` | none | none |
| Info (`ccb3…`) | `calm-disk-8311` | `https://<worker>.calm-disk-8311.workers.dev` | none | none |

No zone routes exist anywhere — all traffic reaches workers via `workers.dev` or the two custom domains above.

## Orphan review — verdicts

| Worker (account) | Frontend target link(s) found | Verdict |
|---|---|---|
| `creatorloop-api`, `creatorloop-api-production` (Admin) | `frontendUrl` = **https://loop.freegameplay.site** (+ `/gamification`, `/settings`); Google/YouTube OAuth inside | **NOT orphaned** — API backend for the LoopSquad frontend at `loop.freegameplay.site` (= Vercel `cloudfront-forge` project). Pairs with worker `cyberelias-techpros-cloudfront-forge`, which is the LoopSquad full-stack bundle itself |
| `directory-api` (Admin + Info) | `SITE_URL` default **https://seemybusiness.com** (`/business/{slug}`); Info copy also allows **https://wacrm-main-kappa.vercel.app** (a Vercel app outside the audited scope) | **DELETED 2026-09-15 (both copies)** — was the likely backend of `see-my-business-contact-gain`, which is now back to R2-images-only. Redeploy from source if that frontend breaks |
| `cybershop-api` (Info) | `APP_URL`/`PUBLIC_URL`-based links, `/business/{slug}` routes (same directory family) | Same business-directory family as `directory-api` — likely backend for `cybershop-web` or the see-my-business frontend (confirm via its `APP_URL` var) |
| `whatsapp-lead-hub` (Admin + Cyberelias, identical 2.2 MB bundle) | Self-served React SPA ("WhatsApp Lead Hub" dashboard + sign-in) + **https://smb.techpros.com.ng** + `/webhooks/whatsapp` | **NOT orphaned** — full-stack worker; its own frontend. `smb.` suggests a see-my-business tie — verify against `see-my-business-contact-gain` before treating as standalone |
| `unashamed-movement` (Cyberelias) | `site_url` default **https://thetimeisnow.org**, `FROM_EMAIL noreply@thetimeisnow.org`, **https://ttin.techpros.com.ng** | **NOT orphaned** — backend of `thetimeisnow.org` (external, non-Vercel). This also explains `ttin-db` + `ttin-uploads`: **TTIN = The Time Is Now** |
| `techtrack` (Cyberelias, 19 KB) | Only `http://localhost:8787/` in bundle | Minimal API, no discoverable frontend — effectively orphaned/unwired |
| `moviesmod` (Eliadztech, 1.8 KB) | None — Telegram Bot API proxy template (`api.telegram.org`) | **DELETED 2026-09-15** — bot webhook, no web frontend |
| `d1-proxy` (Cyber, 22 KB) | None in bundle | Infra worker — check its bindings/vars for which frontend(s) use it |
| `cea-email-worker` (Cyber + Info) | None in bundle | Background queue consumer (`cea-email-queue`) — no frontend by design |
| `curate` D1 + `curate-raw` R2 + `curate-ingest` queues (Cyber) | — | **DELETED 2026-09-15** (R2 buckets were empty; D1 ~72 MB dropped) |
| `slams` D1 (Cyber) | — | **KEPT — belongs to `smart-attendance-hub`** (confirmed by owner) |
| `ce-foundation-school` D1 (Cyber) | — | No worker exists — orphaned storage |
| `business-pulse` D1 (Cyber) | — | **DELETED 2026-09-15** |
| `stellar-launchpad-db` + `stellar-launchpad-uploads` (Cyber) | — | **DELETED 2026-09-15** (R2 bucket was empty) |
| `cybershop`, `it-mastery-suite`, `sambet` (Admin, ~1 KB each) | None — stub-sized, no URLs/markers | Placeholder workers. Note: crossref matched Vercel `it-mastery-suite` and `web` (sambet) to these — the real serving logic may live elsewhere; verify they respond before relying on them |

## Already-matched workers — frontend confirmation

| Worker | Frontend link (from bundle or vars) |
|---|---|
| `vizier-backend` | `ALLOWED_ORIGINS` = **https://vizier-web.vercel.app** (+ 3 preview deploys, `localhost:3000`) — exact Vercel mate |
| `cea-api` (Cyber) | `APP_URL` default **https://cea.ng** (= Vercel `cea-os`) |
| `kidmin-harmony`, `delgra`, `ministry-api`, `affiliate-hub`, `agently-home-hub-api`, `cea-api` (Info), `directory-api`, `cybershop-api`, `kidmin-harmony`, `ministry-api` | Hono APIs, origins via deploy-time env (`ALLOWED_ORIGINS`/`APP_URL`/`SITE_URL`) — frontends are the Vercel mates from the crossref report (`kids-ministry`, `frontend`/delgra, `agently-home-hub`, `cea-os`, `cybershop-web`, `web`/sambet) |
| `cea-notif-worker` (both) | Background (Drizzle/Postgres + queues) — no direct frontend |

## Corrections to `VERCEL-CLOUDFLARE-CROSSREF-REPORT.md`

1. `creatorloop-api` / `creatorloop-api-production` are **not orphaned** — they serve `loop.freegameplay.site`.
2. `see-my-business-contact-gain` upgrades from "partial" to **worker-backed** (`directory-api`, possibly + `cybershop-api` / `whatsapp-lead-hub` via `smb.` domain — confirm which one it calls).
3. `ttin-db` / `ttin-uploads` belong to `unashamed-movement` / `thetimeisnow.org`, not to Vercel `t7m` (which stays unmatched).
4. `it-mastery-suite` and `sambet` workers are stubs — their Vercel matches need a live check (`curl https://<worker>.autumn-surf-21ec.workers.dev`).

## Reproduce

```powershell
# subdomain, domains, routes
# GET /accounts/{id}/workers/subdomain, /accounts/{id}/workers/domains, /zones/{zid}/workers/routes
# script content
# GET /accounts/{id}/workers/scripts/{name}  (then grep FRONTEND_URL|ALLOWED_ORIGINS|SITE_URL|APP_URL|https://)
```
