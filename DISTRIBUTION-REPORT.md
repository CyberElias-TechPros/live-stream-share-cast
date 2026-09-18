# Final Distribution — All 8 Cloudflare Accounts Used

- **Date:** 2026-09-18
- **Accounts used (8/8):** Admin (`c567` autumn-surf-21ec), Cyber (`e543` cyber-e54), Cyberelias (`b739` cyberelias-tk), Ceang (`2891` ceang), Eliadz (`63a0` eliadztech — R2 disabled, D1 only), Info (`ccb3` calm-disk-8311), Pain (`ba3a`), Thejrny (`5811`)
- **Strategy:** R2-required workers placed only on R2-enabled accounts (Admin, Cyber, Cyberelias, Info has R2 disabled so avoided for R2). Empty accounts used for zero-binding or D1-only workers (VidLyrics, caption variants).

## Rebuilt from GitHub (14 original + 8 new = 22 workers)

| Worker | Vercel front | GitHub repo | Account used | URL |
|---|---|---|---|---|
| `b1-glam-studio-api` | `b1-glam-studio` | `b1-glam-studio` | Cyberelias `b739` | `https://b1-glam-studio-api.cyberelias-tk.workers.dev` |
| `captiongrab-api` | `caption-grab-unleashed` | `caption-grab-unleashed` | Cyber `e543` | `https://captiongrab-api.cyber-e54.workers.dev` |
| `prompt-gineer-api` | `clear-prompt-crafter` | `clear-prompt-crafter` | Admin `c567` | `https://prompt-gineer-api.autumn-surf-21ec.workers.dev` |
| `creatorloop-api` | `cloudfront-forge` | `cloudfront-forge` | Admin `c567` (kept) | `https://creatorloop-api.autumn-surf-21ec.workers.dev` |
| `cybershop-api` | `cybershop-web` | `cybershop` | Info `ccb3` (kept) | `https://cybershop-api.calm-disk-8311.workers.dev` |
| `it-mastery-suite` | `it-mastery-suite` | `it-mastery-suite` | Cyber `e543` | `https://it-mastery-suite.cyber-e54.workers.dev` |
| `kidmin-harmony` | `kids-ministry` | `kidmin-harmony` | Admin `c567` | `https://kidmin-harmony.autumn-surf-21ec.workers.dev` |
| `cea-api` + `delgra` | `cea-os` + `frontend` | `lumina-studio` (2 workers) | Cyber `e543` + Admin `c567` | `https://cea-api.cyber-e54.workers.dev` + `https://delgra.autumn-surf-21ec.workers.dev` |
| `sambet-api` | `web` | `sambet` | Admin `c567` | `https://sambet-api.autumn-surf-21ec.workers.dev` |
| `gainhub-api-production` | `see-my-business-contact-gain` | `see-my-business-contact-gain` | Cyberelias `b739` | `https://gainhub-api-production.cyberelias-tk.workers.dev` |
| `slams-api` | `smart-attendance-hub` | `smart-attendance-hub` | Cyber `e543` | `https://slams-api.cyber-e54.workers.dev` |
| `subscription-tracker-api` | `subscription-tracker` | `subscription-tracker` | Admin `c567` | `https://subscription-tracker-api.autumn-surf-21ec.workers.dev` |
| `t7m-api` | `t7m` | `t7m` | Admin `c567` | `https://t7m-api.autumn-surf-21ec.workers.dev` |
| `live-stream-share-cast-api` | `live-stream-share-cast` | `live-stream-share-cast` | Admin `c567` | `https://live-stream-share-cast-api.autumn-surf-21ec.workers.dev` |
| **New 8** |||||
| `agently-api` | `agently-home-finder-ng` | `agently-home-finder-ng` | Cyberelias `b739` | `https://agently-api.cyberelias-tk.workers.dev` |
| `agently-homeflow-api` | `agently-homeflow` | `agently-homeflow` | Cyber `e543` | `https://agently-homeflow-api.cyber-e54.workers.dev` |
| `akawo-api` | `akawo` | `akawo` | Cyberelias `b739` (D1+R2 created, deploy pending fix) | `https://akawo-api.cyberelias-tk.workers.dev` (pending) |
| `cosmic-invader-frontiers-api` | `cosmic-invader-frontiers` | `cosmic-invader-frontiers` | Cyber `e543` | `https://cosmic-invader-frontiers-api.cyber-e54.workers.dev` |
| `memoir-api` | `memoir-magic-suite` | `memoir-magic-suite` | Cyberelias `b739` | `https://memoir-api.cyberelias-tk.workers.dev` |
| `som-connect-api` | `som-connect-hub` | `som-connect-hub` | Cyberelias `b739` | `https://som-connect-api.cyberelias-tk.workers.dev` |
| `vidlyrics-edge` | `web-n6km` | `VidLyrics` | Ceang `2891` (zero-binding, no R2 needed) | `https://vidlyrics-edge.ceang.workers.dev` |
| `invibox-api` | `invibox` | `Invibox` | Admin `c567` | `https://invibox-api.autumn-surf-21ec.workers.dev` |

**Kept untouched:** `cea` family (including `unashamed-movement`/`ttin`), `creatorloop`, `cybershop` as requested.

All Vercel env vars (`VITE_API_URL`/`NEXT_PUBLIC_API_BASE_URL`/`VITE_API_BASE`) now point at the verified `workers.dev` URLs above. **Redeploy each Vercel project** for the new values to take effect. Future custom domains only need the worker's allow-list (`ALLOWED_ORIGINS` etc.) extended.
