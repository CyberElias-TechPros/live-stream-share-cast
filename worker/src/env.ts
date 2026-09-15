/**
 * Bindings + runtime variables available to the Worker and its Durable Objects.
 *
 * D1  (DB)         — relational data (users, streams, chat, sessions…)
 * R2  (RECORDINGS) — stream recordings (VODs)
 * R2  (AVATARS)    — profile avatars / thumbnails
 * DO  (CHAT_ROOM)  — one Durable Object per stream: live chat + presence
 * DO  (SIGNAL_ROOM)— one Durable Object per stream: WebRTC signalling
 */
export interface Env {
  DB: D1Database;
  RECORDINGS: R2Bucket;
  AVATARS: R2Bucket;
  CHAT_ROOM: DurableObjectNamespace;
  SIGNAL_ROOM: DurableObjectNamespace;

  /** HMAC key used to sign access/refresh JWTs. Required. */
  JWT_SECRET: string;
  /** Shared secret protecting the `/api/admin/*` endpoints. */
  CLEANUP_TOKEN?: string;

  ENVIRONMENT?: string;
  /** Comma separated allow-list, or `*` (default) to echo the request origin. */
  ALLOWED_ORIGINS?: string;
  /** How long an uploaded recording lives before the cron deletes it. */
  RECORDING_RETENTION_HOURS?: string;
  /** A live stream whose host stopped sending heartbeats is forced offline. */
  STALE_STREAM_MINUTES?: string;
  /** TTL for R2 playback URLs. */
  SIGNED_URL_TTL?: string;
  /** Hard cap for a single upload, in bytes. */
  MAX_UPLOAD_BYTES?: string;
}

export type AppVariables = {
  /** Populated by `requireAuth` / `optionalAuth`. */
  authUser?: AuthUser;
  /** JWT id of the current access token — used to revoke the session. */
  authJti?: string;
};

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  isStreamer?: boolean;
  isAdmin?: boolean;
}
