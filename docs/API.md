# API reference

Base path: `/api` on the Worker host (during development Vite proxies `/api` to
`:8787`). All responses are JSON; errors have the shape

```json
{ "error": "Human readable message", "code": "machine_code", "details": {} }
```

Auth is a Bearer access token (`Authorization: Bearer <jwt>`, 1 h) refreshed
through `POST /api/auth/refresh`. Personal API tokens (`lsc_…`, created in
Settings → Security) work in the same header and carry scopes.

| Code                   | Meaning                                                    |
| ---------------------- | ---------------------------------------------------------- |
| `unauthorized`         | missing/expired credentials                                |
| `forbidden`            | authenticated but not allowed (ownership/role)             |
| `account_banned`       | account suspended or banned                                |
| `rate_limited`         | too many requests (see `Retry-After`)                      |
| `payments_unavailable` | tips are switched off or the provider is unreachable       |
| `not_configured`       | the deployment is missing keys for the requested feature   |

---

## Public configuration

| Method | Path                     | Auth | Notes                                             |
| ------ | ------------------------ | ---- | ------------------------------------------------- |
| GET    | `/config`                | –    | brand, limits, features, payment presets, push key |
| GET    | `/runtime-config.json`   | –    | same payload, cacheable (`max-age=300`)            |
| GET    | `/config/rtc/ice`        | –    | ICE servers; TURN credentials are short-lived       |
| GET    | `/config/categories`     | –    | browse taxonomy with live-stream counts             |
| GET    | `/config/features`       | –    | database feature flags                              |
| GET    | `/health`                | –    | service status + `pendingConfiguration`             |
| POST   | `/telemetry/errors`      | opt. | client error reports (fingerprinted, de-duplicated) |

## Auth — `/api/auth`

`signup`, `login`, `refresh`, `logout`, `logout-all`, `me`, `forgot-password`,
`reset-password`, `change-password`, `verify-email`, `resend-verification`,
`legal`, `sessions` (list / revoke one / revoke all), `tokens` (create / list /
revoke), `account/export`, `account` (DELETE, requires password + `"DELETE"`).

Signup accepts an optional captcha token; login is rate limited and locks after
10 failures per email/IP within 15 minutes.

## Users & social graph — `/api/users`, `/api/profiles`

| Method | Path                     | Notes                                          |
| ------ | ------------------------ | ---------------------------------------------- |
| GET    | `/users/me`              | private profile, preferences, `isAdmin`        |
| PATCH  | `/users/me`              | username, display name, bio, links, donation   |
| PATCH  | `/users/me/preferences`  | deep-merged preferences                        |
| POST   | `/users/me/streamer`     | enable/disable streamer mode                   |
| POST   | `/users/me/avatar`       | multipart upload → R2                          |
| GET    | `/users/me/streams`      | own streams (includes stream keys)             |
| GET    | `/users/me/sessions`     | broadcast history                              |
| GET    | `/users/:id`             | public profile + extras (privacy enforced)     |
| GET    | `/users/:id/streams`     | that creator's streams                         |
| GET    | `/users/:id/recordings`  | their public VODs                              |
| GET    | `/users/:id/schedule`    | their upcoming broadcasts                      |
| GET    | `/users/:id/followers`, `/following` | paginated lists                   |
| GET    | `/users/:id/follow`      | `{ isFollowing }`                              |
| PUT    | `/users/:id/follow`      | follow (fires `user.followed` + notification)  |
| DELETE | `/users/:id/follow`      | unfollow                                       |
| GET    | `/profiles/:username`    | public profile by handle                       |

## Streams — `/api/streams`

| Method | Path                      | Notes                                             |
| ------ | ------------------------- | ------------------------------------------------- |
| GET    | `/streams`                | `?live&category&search&q&userId&sort&limit&offset` |
| POST   | `/streams`                | create (limits: count, title length, tags)        |
| GET    | `/streams/:id`            | public view; stream key only for the owner        |
| PATCH  | `/streams/:id`            | title, description, tags, maturity, retention     |
| DELETE | `/streams/:id`            | owner only                                        |
| POST   | `/streams/:id/start`      | go live → notification fan-out, webhook, chat notice |
| POST   | `/streams/:id/stop`       | end broadcast, close session, complete schedule   |
| POST   | `/streams/:id/heartbeat`  | keeps the broadcast alive (`STALE_STREAM_MINUTES`) |
| POST   | `/streams/:id/viewers`    | viewer bookkeeping for non-socket clients         |
| POST   | `/streams/:id/stats`, GET `/streams/:id/stats` | bandwidth/CPU telemetry          |
| GET    | `/streams/:id/sessions`   | past sessions                                     |
| GET    | `/streams/:id/presence`   | `{ viewers, hostConnected, live }` from the DO     |
| GET    | `/streams/:id/chat`       | history (respects deleted/moderated) + `rules`     |
| POST   | `/streams/:id/chat`       | post (moderation, mentions, replies, webhook)      |
| PATCH  | `/streams/:id/chat/:messageId` | owner/mod: hide or restore                   |
| PATCH  | `/chat/:messageId`        | alias used by the player overlay                   |

## Media & VOD

| Method | Path                             | Notes                                        |
| ------ | -------------------------------- | -------------------------------------------- |
| POST   | `/media/recordings`              | multipart upload → R2 + `recordings` row      |
| POST   | `/media/thumbnails`              | stream/recording thumbnails                   |
| GET    | `/media/recordings/*`, `/media/avatars/*` | R2 objects (Range supported)          |
| DELETE | `/media/recordings/*`            | owner only                                    |
| GET    | `/recordings`                    | public library (`?search&sort&userId&limit`)  |
| GET    | `/recordings/mine`               | the creator's library                         |
| GET    | `/recordings/:id`                | one recording (visibility enforced)           |
| PATCH  | `/recordings/:id`                | title, description, visibility, tags          |
| DELETE | `/recordings/:id`                | delete from R2 + D1                           |
| POST   | `/recordings/:id/clip`           | cut a clip (`startSeconds`, `endSeconds`)     |
| POST   | `/recordings/:id/view`           | start a VOD watch session                     |

## Notifications — `/api/notifications`

`GET /notifications` (list, `?unread&type&limit&offset`), `GET /unread-count`,
`POST /:id/read`, `POST /read-all`, `DELETE /:id`,
`GET|PUT /preferences`, `POST|DELETE /push/subscribe`.

## Analytics — `/api/analytics`

`POST /watch/start`, `POST /watch/heartbeat`, `POST /watch/end` (viewer watch
time), `GET /overview` (creator dashboard), `GET /streams/:id` (per broadcast),
`GET /history` (continue watching), `GET /users/:id` (public profile stats),
`GET /platform` (admin), `GET /daily` (raw rollups).

## Schedule — `/api/schedule`

`GET /` (upcoming, public), `GET /mine`, `POST /` (create),
`PATCH /:id`, `DELETE /:id`, `POST /:id/remind` (viewer reminder toggle),
`POST /:id/go-live` (spin the slot into a stream).

## Moderation — `/api/moderation`

`POST /reports`, `GET /reports/mine`, `GET|POST|DELETE /blocks[/:userId]`,
`GET|PUT /chat/:streamId/settings`, `GET|POST|DELETE
/chat/:streamId/restrictions[/:userId]`, `GET /chat/:streamId/rules`.

## Payments — `/api/payments`

`GET /config`, `GET /presets`, `POST /tips` (returns a checkout URL, or the
creator's donation link when card payments are off), `GET /tips/mine`,
`GET /tips/:id/status`, `GET /earnings`, `PUT /donation-link`,
`POST /webhook/stripe`, `POST /webhook/provider`.

## Integrations & search

`GET /integrations/events`, `GET|POST /integrations/webhooks`,
`PATCH|DELETE /integrations/webhooks/:id`, `POST /integrations/webhooks/:id/rotate`,
`POST /integrations/webhooks/:id/test`, `GET /search?q=…`.

## Admin — `/api/admin`

`GET /overview`, `GET /users`, `POST /users/:id/ban`, `POST /users/:id/unban`,
`POST /users/:id/role`, `POST /users/:id/verify`, `GET /streams`,
`POST /streams/:id/end`, `DELETE /streams/:id`, `GET /reports`,
`PATCH /reports/:id`, `GET /bans`, `DELETE /bans/:id`, `GET /audit`,
`GET /email`, `POST /email/flush`, `POST /email/test`, `GET /errors`,
`DELETE /errors/:id`, `GET /flags`, `PUT /flags/:key`, `GET /categories`,
`POST /categories`, `PATCH /categories/:slug`, `GET /payments`,
`POST /cleanup` (token-protected), `POST /cleanup/recordings`.

## WebSockets

| Path                             | Query                                  | Purpose                       |
| -------------------------------- | -------------------------------------- | ----------------------------- |
| `/api/ws/chat/:streamId`         | `role=host\|viewer`, `token`           | chat, presence, moderation    |
| `/api/ws/signal/:streamId`       | `role=host\|viewer`, `peerId`, `token` | WebRTC offer/answer/ICE       |

`role=host` requires ownership of the stream. Banned accounts are rejected with
`account_banned`. Both upgrade through the same origin as the REST API, so no
extra proxy configuration is needed in production.
