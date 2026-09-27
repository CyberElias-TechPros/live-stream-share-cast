/**
 * Bindings + runtime variables available to the Worker and its Durable Objects.
 *
 * Core bindings are required; every third-party integration is optional and
 * resolved through `src/lib/config.ts`, so the Worker boots (and degrades
 * gracefully) before the corresponding keys are added.
 *
 * D1  (DB)         — relational data (users, streams, chat, sessions…)
 * R2  (RECORDINGS) — stream recordings (VODs)
 * R2  (AVATARS)    — profile avatars / thumbnails
 * DO  (CHAT_ROOM)  — one Durable Object per stream: live chat + presence
 * DO  (SIGNAL_ROOM)— one Durable Object per stream: WebRTC signalling
 * KV  (CACHE)      — optional: distributed rate limits + config cache
 */
export interface Env {
  DB: D1Database;
  RECORDINGS: R2Bucket;
  AVATARS: R2Bucket;
  CHAT_ROOM: DurableObjectNamespace;
  SIGNAL_ROOM: DurableObjectNamespace;
  /** Optional KV namespace — enables global (not per-isolate) rate limiting. */
  CACHE?: KVNamespace;

  /* ------------------------------- core secrets ------------------------------ */

  /** HMAC key used to sign access/refresh JWTs. Required. */
  JWT_SECRET: string;
  /** Shared secret protecting the `/api/admin/*` endpoints. */
  CLEANUP_TOKEN?: string;

  /* --------------------------------- runtime --------------------------------- */

  ENVIRONMENT?: string;
  /** Comma separated allow-list, or `*` (default) to echo the request origin. */
  ALLOWED_ORIGINS?: string;
  /** Public base URL of the deployment (used in emails and canonical links). */
  APP_URL?: string;
  APP_NAME?: string;
  APP_TAGLINE?: string;
  APP_VERSION?: string;
  SUPPORT_EMAIL?: string;
  DOCS_URL?: string;
  STATUS_URL?: string;

  /* ------------------------------- brand / legal ----------------------------- */

  SOCIAL_TWITTER?: string;
  SOCIAL_GITHUB?: string;
  SOCIAL_DISCORD?: string;
  SOCIAL_YOUTUBE?: string;
  SOCIAL_INSTAGRAM?: string;
  TERMS_VERSION?: string;
  PRIVACY_VERSION?: string;
  LEGAL_ENTITY?: string;
  LEGAL_JURISDICTION?: string;

  /* ---------------------------------- limits --------------------------------- */

  /** How long an uploaded recording lives before the cron deletes it. */
  RECORDING_RETENTION_HOURS?: string;
  /** A live stream whose host stopped sending heartbeats is forced offline. */
  STALE_STREAM_MINUTES?: string;
  /** TTL for signed playback URLs. */
  SIGNED_URL_TTL?: string;
  /** Hard cap for a single upload, in bytes. */
  MAX_UPLOAD_BYTES?: string;
  MAX_AVATAR_BYTES?: string;
  MAX_CHAT_MESSAGE_LENGTH?: string;
  MAX_TITLE_LENGTH?: string;
  MAX_BIO_LENGTH?: string;
  MAX_TAGS?: string;
  CHAT_HISTORY_PAGE_SIZE?: string;
  MAX_STREAMS_PER_USER?: string;
  MAX_SCHEDULED_PER_USER?: string;

  /* ---------------------------------- email ---------------------------------- */

  EMAIL_PROVIDER?: 'resend' | 'postmark' | 'sendgrid' | 'mailchannels' | 'webhook' | 'none' | string;
  EMAIL_FROM?: string;
  EMAIL_FROM_NAME?: string;
  EMAIL_REPLY_TO?: string;
  RESEND_API_KEY?: string;
  POSTMARK_SERVER_TOKEN?: string;
  POSTMARK_MESSAGE_STREAM?: string;
  SENDGRID_API_KEY?: string;
  MAILCHANNELS_API_KEY?: string;
  /** Generic HTTP relay (Zapier / Make / n8n / your own SMTP bridge). */
  EMAIL_WEBHOOK_URL?: string;
  EMAIL_WEBHOOK_TOKEN?: string;
  /** How many queued emails one cron pass may flush. */
  EMAIL_BATCH_SIZE?: string;
  EMAIL_MAX_ATTEMPTS?: string;
  /** Route all email to this address instead of the real recipient (staging). */
  EMAIL_OVERRIDE_TO?: string;
  /** Cap how many "X is live" emails a single broadcast may queue. */
  EMAIL_FANOUT_LIMIT?: string;

  /* ------------------------------ WebRTC / TURN ------------------------------ */

  TURN_PROVIDER?: 'cloudflare' | 'static' | 'none' | string;
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
  TURN_STATIC_USERNAME?: string;
  TURN_STATIC_PASSWORD?: string;
  TURN_URLS?: string;
  STUN_URLS?: string;
  TURN_CREDENTIAL_TTL?: string;

  /* --------------------------------- captcha --------------------------------- */

  CAPTCHA_PROVIDER?: 'turnstile' | 'hcaptcha' | 'none' | string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  HCAPTCHA_SECRET_KEY?: string;
  HCAPTCHA_SITE_KEY?: string;

  /* -------------------------------- payments --------------------------------- */

  PAYMENT_PROVIDER?: 'stripe' | 'webhook' | 'none' | string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  PAYMENT_WEBHOOK_URL?: string;
  PAYMENTS_CURRENCY?: string;
  MIN_TIP_CENTS?: string;
  MAX_TIP_CENTS?: string;
  PLATFORM_FEE_PERCENT?: string;
  PAYMENT_SUCCESS_URL?: string;
  PAYMENT_CANCEL_URL?: string;

  /* ------------------------------ observability ------------------------------ */

  SENTRY_DSN?: string;
  LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error' | string;
  ERROR_REPORT_SAMPLE_RATE?: string;
  ANALYTICS_PROVIDER?: string;
  ANALYTICS_SITE_ID?: string;
  ANALYTICS_SCRIPT_URL?: string;

  /* -------------------------------- features --------------------------------- */

  FEATURE_SIGNUPS?: string;
  FEATURE_REQUIRE_EMAIL_VERIFICATION?: string;
  FEATURE_CHAT?: string;
  FEATURE_SCHEDULING?: string;
  FEATURE_VOD?: string;
  FEATURE_CLIPS?: string;
  FEATURE_TIPS?: string;
  FEATURE_WEBHOOKS?: string;
  FEATURE_API_TOKENS?: string;
  FEATURE_SCHEDULE_REMINDERS?: string;
  FEATURE_MOD_CONSOLE?: string;
  FEATURE_DATA_EXPORT?: string;
  FEATURE_ACCOUNT_DELETION?: string;
  FEATURE_PUSH?: string;
  /** VAPID keys for Web Push (see lib/push.ts). */
  PUSH_VAPID_PUBLIC_KEY?: string;
  PUSH_VAPID_PRIVATE_KEY?: string;
  PUSH_SUBJECT?: string;
  FEATURE_CLIENT_ERRORS?: string;
}

export type AppVariables = {
  /** Populated by `requireAuth` / `optionalAuth`. */
  authUser?: AuthUser;
  /** JWT id of the current access token — used to revoke the session. */
  authJti?: string;
  /** Correlation id echoed in logs and the `X-Request-Id` response header. */
  requestId?: string;
};

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  isStreamer?: boolean;
  isAdmin?: boolean;
  /** Populated when the request was authenticated with a personal API token. */
  scopes?: string[];
  /** True when the account is currently banned/suspended. */
  banned?: boolean;
}
