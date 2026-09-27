/**
 * Central runtime configuration.
 *
 * Every optional third-party integration is resolved here, so the rest of the
 * Worker (and the frontend, through `GET /api/config`) can ask a single
 * question — "is this configured?" — instead of scattering `env.X &&` checks.
 *
 * Nothing in this file throws when a key is missing: features degrade to a
 * sensible no-op and the admin health endpoint reports what still needs a key.
 */

import type { Env } from '../env';
import { pushConfig } from './push';

/* --------------------------------- helpers ---------------------------------- */

function flag(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(value.trim().toLowerCase());
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  const normalized = (value ?? '').trim().toLowerCase() as T;
  return allowed.includes(normalized) ? normalized : fallback;
}

/* ------------------------------- email / SMTP -------------------------------- */

export type EmailProvider = 'resend' | 'postmark' | 'sendgrid' | 'mailchannels' | 'webhook' | 'none';

export interface EmailConfig {
  provider: EmailProvider;
  configured: boolean;
  from: string;
  fromName: string;
  replyTo: string | null;
  apiKey: string | null;
  webhookUrl: string | null;
  webhookToken: string | null;
  messageStream: string;
}

export function emailConfig(env: Env): EmailConfig {
  const requested = (env.EMAIL_PROVIDER ?? '').trim().toLowerCase();

  // Auto-detect when EMAIL_PROVIDER is not set but a provider key is present.
  const detected: EmailProvider = requested
    ? (requested as EmailProvider)
    : env.RESEND_API_KEY
      ? 'resend'
      : env.POSTMARK_SERVER_TOKEN
        ? 'postmark'
        : env.SENDGRID_API_KEY
          ? 'sendgrid'
          : env.MAILCHANNELS_API_KEY
            ? 'mailchannels'
            : env.EMAIL_WEBHOOK_URL
              ? 'webhook'
              : 'none';

  const provider = (['resend', 'postmark', 'sendgrid', 'mailchannels', 'webhook', 'none'] as const).includes(
    detected as EmailProvider,
  )
    ? (detected as EmailProvider)
    : 'none';

  const apiKey =
    provider === 'resend'
      ? env.RESEND_API_KEY ?? null
      : provider === 'postmark'
        ? env.POSTMARK_SERVER_TOKEN ?? null
        : provider === 'sendgrid'
          ? env.SENDGRID_API_KEY ?? null
          : provider === 'mailchannels'
            ? env.MAILCHANNELS_API_KEY ?? null
            : null;

  return {
    provider,
    configured: provider !== 'none' && (provider === 'webhook' ? !!env.EMAIL_WEBHOOK_URL : !!apiKey),
    from: env.EMAIL_FROM ?? 'no-reply@example.com',
    fromName: env.EMAIL_FROM_NAME ?? env.APP_NAME ?? "I'm Live",
    replyTo: env.EMAIL_REPLY_TO ?? null,
    apiKey,
    webhookUrl: env.EMAIL_WEBHOOK_URL ?? null,
    webhookToken: env.EMAIL_WEBHOOK_TOKEN ?? null,
    messageStream: env.POSTMARK_MESSAGE_STREAM ?? 'outbound',
  };
}

/* ------------------------------ WebRTC / TURN -------------------------------- */

export type TurnProvider = 'cloudflare' | 'static' | 'none';

export interface TurnConfig {
  provider: TurnProvider;
  configured: boolean;
  stunUrls: string[];
  turnUrls: string[];
  /** Cloudflare Calls TURN credentials (short-lived, minted per request). */
  keyId: string | null;
  apiToken: string | null;
  /** Static TURN credentials (any RFC-5766 provider). */
  staticUsername: string | null;
  staticPassword: string | null;
  ttlSeconds: number;
}

export function turnConfig(env: Env): TurnConfig {
  const requested = (env.TURN_PROVIDER ?? '').trim().toLowerCase();
  const provider: TurnProvider = requested
    ? (['cloudflare', 'static', 'none'].includes(requested) ? (requested as TurnProvider) : 'none')
    : env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN
      ? 'cloudflare'
      : env.TURN_STATIC_USERNAME && env.TURN_STATIC_PASSWORD
        ? 'static'
        : 'none';

  return {
    provider,
    configured: provider === 'cloudflare' ? !!(env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN) : provider === 'static' ? !!(env.TURN_STATIC_USERNAME && env.TURN_STATIC_PASSWORD) : false,
    stunUrls: list(env.STUN_URLS).length ? list(env.STUN_URLS) : ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'],
    turnUrls: list(env.TURN_URLS).length ? list(env.TURN_URLS) : ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:3478?transport=tcp'],
    keyId: env.TURN_KEY_ID ?? null,
    apiToken: env.TURN_KEY_API_TOKEN ?? null,
    staticUsername: env.TURN_STATIC_USERNAME ?? null,
    staticPassword: env.TURN_STATIC_PASSWORD ?? null,
    ttlSeconds: num(env.TURN_CREDENTIAL_TTL, 86_400),
  };
}

/* --------------------------------- captcha ----------------------------------- */

export type CaptchaProvider = 'turnstile' | 'hcaptcha' | 'none';

export interface CaptchaConfig {
  provider: CaptchaProvider;
  configured: boolean;
  secret: string | null;
  /** Public (site) key — safe to ship to the browser. */
  siteKey: string | null;
}

export function captchaConfig(env: Env): CaptchaConfig {
  const requested = (env.CAPTCHA_PROVIDER ?? '').trim().toLowerCase();
  const provider: CaptchaProvider = requested
    ? (['turnstile', 'hcaptcha', 'none'].includes(requested) ? (requested as CaptchaProvider) : 'none')
    : env.TURNSTILE_SECRET_KEY
      ? 'turnstile'
      : env.HCAPTCHA_SECRET_KEY
        ? 'hcaptcha'
        : 'none';

  const secret = provider === 'turnstile' ? env.TURNSTILE_SECRET_KEY ?? null : provider === 'hcaptcha' ? env.HCAPTCHA_SECRET_KEY ?? null : null;
  const siteKey = provider === 'turnstile' ? env.TURNSTILE_SITE_KEY ?? null : provider === 'hcaptcha' ? env.HCAPTCHA_SITE_KEY ?? null : null;

  return { provider, configured: !!(secret && siteKey), secret, siteKey };
}

/* --------------------------------- payments ---------------------------------- */

export type PaymentProvider = 'stripe' | 'webhook' | 'none';

export interface PaymentConfig {
  provider: PaymentProvider;
  configured: boolean;
  /** Payments (tips) feature flag. */
  enabled: boolean;
  secretKey: string | null;
  webhookSecret: string | null;
  currency: string;
  minTipCents: number;
  maxTipCents: number;
  platformFeePercent: number;
  successUrl: string | null;
  cancelUrl: string | null;
  checkoutsEnabled: boolean;
}

export function paymentConfig(env: Env): PaymentConfig {
  const requested = (env.PAYMENT_PROVIDER ?? '').trim().toLowerCase();
  const provider: PaymentProvider = requested
    ? ([ 'stripe', 'webhook', 'none' ].includes(requested) ? (requested as PaymentProvider) : 'none')
    : env.STRIPE_SECRET_KEY
      ? 'stripe'
      : env.PAYMENT_WEBHOOK_URL
        ? 'webhook'
        : 'none';

  return {
    provider,
    configured: provider === 'stripe' ? !!env.STRIPE_SECRET_KEY : provider === 'webhook' ? !!env.PAYMENT_WEBHOOK_URL : false,
    enabled: flag(env.FEATURE_TIPS, false),
    secretKey: env.STRIPE_SECRET_KEY ?? null,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET ?? null,
    currency: (env.PAYMENTS_CURRENCY ?? 'usd').toLowerCase(),
    minTipCents: num(env.MIN_TIP_CENTS, 100),
    maxTipCents: num(env.MAX_TIP_CENTS, 500_000),
    platformFeePercent: num(env.PLATFORM_FEE_PERCENT, 0),
    successUrl: env.PAYMENT_SUCCESS_URL ?? null,
    cancelUrl: env.PAYMENT_CANCEL_URL ?? null,
    checkoutsEnabled: provider === 'stripe' && !!env.STRIPE_SECRET_KEY,
  };
}

/* ------------------------------- observability -------------------------------- */

export interface ObservabilityConfig {
  sentryDsn: string | null;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  errorReportSampleRate: number;
  clientErrorsEnabled: boolean;
  analyticsProvider: string;
  analyticsSiteId: string | null;
  analyticsScriptUrl: string | null;
}

export function observabilityConfig(env: Env): ObservabilityConfig {
  return {
    sentryDsn: env.SENTRY_DSN ?? null,
    logLevel: pick(env.LOG_LEVEL as ObservabilityConfig['logLevel'], ['debug', 'info', 'warn', 'error'], 'info'),
    errorReportSampleRate: Math.min(Math.max(num(env.ERROR_REPORT_SAMPLE_RATE, 1), 0), 1),
    clientErrorsEnabled: flag(env.FEATURE_CLIENT_ERRORS, true),
    analyticsProvider: (env.ANALYTICS_PROVIDER ?? 'none').toLowerCase(),
    analyticsSiteId: env.ANALYTICS_SITE_ID ?? null,
    analyticsScriptUrl: env.ANALYTICS_SCRIPT_URL ?? null,
  };
}

/* ---------------------------------- brand ------------------------------------ */

export interface BrandConfig {
  name: string;
  tagline: string;
  url: string | null;
  supportEmail: string | null;
  docsUrl: string | null;
  statusUrl: string | null;
  socials: Record<string, string>;
  termsVersion: string;
  privacyVersion: string;
  legalEntity: string | null;
  jurisdiction: string | null;
}

export function brandConfig(env: Env): BrandConfig {
  return {
    name: env.APP_NAME ?? "I'm Live",
    tagline: env.APP_TAGLINE ?? 'Share the moment, live.',
    url: env.APP_URL ?? null,
    supportEmail: env.SUPPORT_EMAIL ?? null,
    docsUrl: env.DOCS_URL ?? null,
    statusUrl: env.STATUS_URL ?? null,
    socials: {
      twitter: env.SOCIAL_TWITTER ?? '',
      github: env.SOCIAL_GITHUB ?? '',
      discord: env.SOCIAL_DISCORD ?? '',
      youtube: env.SOCIAL_YOUTUBE ?? '',
      instagram: env.SOCIAL_INSTAGRAM ?? '',
    },
    termsVersion: env.TERMS_VERSION ?? '2026-01-01',
    privacyVersion: env.PRIVACY_VERSION ?? '2026-01-01',
    legalEntity: env.LEGAL_ENTITY ?? null,
    jurisdiction: env.LEGAL_JURISDICTION ?? null,
  };
}

/* ---------------------------------- limits ----------------------------------- */

export interface LimitsConfig {
  maxChatMessageLength: number;
  maxTitleLength: number;
  maxBioLength: number;
  maxTags: number;
  maxUploadBytes: number;
  maxAvatarBytes: number;
  recordingRetentionHours: number;
  staleStreamMinutes: number;
  chatHistoryPageSize: number;
  maxStreamsPerUser: number;
  maxScheduledPerUser: number;
  defaultTipPresets: number[];
}

export function limitsConfig(env: Env): LimitsConfig {
  return {
    maxChatMessageLength: num(env.MAX_CHAT_MESSAGE_LENGTH, 500),
    maxTitleLength: num(env.MAX_TITLE_LENGTH, 140),
    maxBioLength: num(env.MAX_BIO_LENGTH, 500),
    maxTags: num(env.MAX_TAGS, 8),
    maxUploadBytes: num(env.MAX_UPLOAD_BYTES, 512 * 1024 * 1024),
    maxAvatarBytes: num(env.MAX_AVATAR_BYTES, 5 * 1024 * 1024),
    recordingRetentionHours: num(env.RECORDING_RETENTION_HOURS, 6),
    staleStreamMinutes: num(env.STALE_STREAM_MINUTES, 5),
    chatHistoryPageSize: num(env.CHAT_HISTORY_PAGE_SIZE, 100),
    maxStreamsPerUser: num(env.MAX_STREAMS_PER_USER, 50),
    maxScheduledPerUser: num(env.MAX_SCHEDULED_PER_USER, 20),
    defaultTipPresets: [200, 500, 1000, 2500, 5000],
  };
}

/* --------------------------------- features ---------------------------------- */

export interface FeatureConfig {
  signups: boolean;
  emailVerificationRequired: boolean;
  chat: boolean;
  scheduling: boolean;
  vod: boolean;
  clips: boolean;
  tips: boolean;
  webhooks: boolean;
  apiTokens: boolean;
  schedulingReminders: boolean;
  modConsole: boolean;
  dataExport: boolean;
  accountDeletion: boolean;
  pushNotifications: boolean;
}

export function featureConfig(env: Env): FeatureConfig {
  return {
    signups: flag(env.FEATURE_SIGNUPS, true),
    emailVerificationRequired: flag(env.FEATURE_REQUIRE_EMAIL_VERIFICATION, false),
    chat: flag(env.FEATURE_CHAT, true),
    scheduling: flag(env.FEATURE_SCHEDULING, true),
    vod: flag(env.FEATURE_VOD, true),
    clips: flag(env.FEATURE_CLIPS, true),
    tips: flag(env.FEATURE_TIPS, false),
    webhooks: flag(env.FEATURE_WEBHOOKS, true),
    apiTokens: flag(env.FEATURE_API_TOKENS, true),
    schedulingReminders: flag(env.FEATURE_SCHEDULE_REMINDERS, true),
    modConsole: flag(env.FEATURE_MOD_CONSOLE, true),
    dataExport: flag(env.FEATURE_DATA_EXPORT, true),
    accountDeletion: flag(env.FEATURE_ACCOUNT_DELETION, true),
    pushNotifications: flag(env.FEATURE_PUSH, false),
  };
}

/* ------------------------------- integration map -------------------------------
 * Used by `GET /api/health` (and the admin console) to show exactly which
 * credentials still need to be added before a feature goes live.
 * ---------------------------------------------------------------------------- */

export interface IntegrationStatus {
  id: string;
  label: string;
  configured: boolean;
  requiredFor: string[];
  /** Environment variables that turn the integration on. */
  envVars: string[];
  notes?: string;
}

export function integrationStatus(env: Env): IntegrationStatus[] {
  const email = emailConfig(env);
  const turn = turnConfig(env);
  const captcha = captchaConfig(env);
  const payments = paymentConfig(env);
  const observability = observabilityConfig(env);

  return [
    {
      id: 'database',
      label: 'Cloudflare D1',
      configured: true,
      requiredFor: ['everything'],
      envVars: ['DB'],
    },
    {
      id: 'storage',
      label: 'Cloudflare R2',
      configured: true,
      requiredFor: ['recordings', 'avatars', 'VOD'],
      envVars: ['RECORDINGS', 'AVATARS'],
    },
    {
      id: 'realtime',
      label: 'Durable Objects',
      configured: true,
      requiredFor: ['chat', 'presence', 'WebRTC signalling'],
      envVars: ['CHAT_ROOM', 'SIGNAL_ROOM'],
    },
    {
      id: 'auth',
      label: 'JWT signing secret',
      configured: !!env.JWT_SECRET,
      requiredFor: ['sign-in', 'sessions', 'API auth'],
      envVars: ['JWT_SECRET'],
      notes: 'Required in production — sessions cannot be trusted without it.',
    },
    {
      id: 'email',
      label: `Transactional email (${email.provider})`,
      configured: email.configured,
      requiredFor: ['password reset', 'email verification', 'notifications', 'moderation notices'],
      envVars: ['EMAIL_PROVIDER', 'EMAIL_FROM', 'RESEND_API_KEY | POSTMARK_SERVER_TOKEN | SENDGRID_API_KEY | MAILCHANNELS_API_KEY | EMAIL_WEBHOOK_URL'],
    },
    {
      id: 'turn',
      label: `TURN relay (${turn.provider})`,
      configured: turn.configured,
      requiredFor: ['WebRTC for viewers behind symmetric NAT / mobile networks'],
      envVars: ['TURN_PROVIDER', 'TURN_KEY_ID', 'TURN_KEY_API_TOKEN', 'TURN_STATIC_USERNAME', 'TURN_STATIC_PASSWORD'],
      notes: 'Without TURN roughly 10–20% of viewer connections fail.',
    },
    {
      id: 'captcha',
      label: `Captcha (${captcha.provider})`,
      configured: captcha.configured,
      requiredFor: ['signup / login bot protection'],
      envVars: ['CAPTCHA_PROVIDER', 'TURNSTILE_SECRET_KEY', 'TURNSTILE_SITE_KEY'],
    },
    {
      id: 'payments',
      label: `Payments (${payments.provider})`,
      configured: payments.configured,
      requiredFor: ['tips / donations'],
      envVars: ['PAYMENT_PROVIDER', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'FEATURE_TIPS'],
    },
    {
      id: 'push',
      label: 'Web Push (VAPID)',
      configured: pushConfig(env).enabled && pushConfig(env).configured,
      requiredFor: ['browser push notifications for followers going live'],
      envVars: ['FEATURE_PUSH', 'PUSH_VAPID_PUBLIC_KEY', 'PUSH_VAPID_PRIVATE_KEY', 'PUSH_SUBJECT'],
      notes: 'Subscriptions are stored either way; the keys simply enable delivery.',
    },
    {
      id: 'analytics',
      label: `Product analytics (${observability.analyticsProvider})`,
      configured: observability.analyticsProvider !== 'none' && !!observability.analyticsSiteId,
      requiredFor: ['page-view analytics', 'growth reporting'],
      envVars: ['ANALYTICS_PROVIDER', 'ANALYTICS_SITE_ID', 'ANALYTICS_SCRIPT_URL'],
    },
    {
      id: 'errorTracking',
      label: 'Error tracking (Sentry)',
      configured: !!observability.sentryDsn,
      requiredFor: ['production error monitoring'],
      envVars: ['SENTRY_DSN', 'ERROR_REPORT_SAMPLE_RATE'],
    },
    {
      id: 'webhooks',
      label: 'Outbound webhooks',
      configured: true,
      requiredFor: ['Discord/Slack/Zapier integrations per creator'],
      envVars: [],
      notes: 'Creators add their own endpoint URLs; no platform key required.',
    },
  ];
}

/** Everything the browser legitimately needs to know about the deployment. */
export function publicConfig(env: Env, origin: string) {
  const brand = brandConfig(env);
  const limits = limitsConfig(env);
  const features = featureConfig(env);
  const captcha = captchaConfig(env);
  const payments = paymentConfig(env);
  const observability = observabilityConfig(env);
  const turn = turnConfig(env);

  return {
    brand,
    limits,
    features,
    captcha: { provider: captcha.provider, siteKey: captcha.siteKey, enabled: captcha.configured },
    payments: {
      provider: payments.provider,
      enabled: payments.enabled && payments.configured,
      currency: payments.currency,
      minTipCents: payments.minTipCents,
      maxTipCents: payments.maxTipCents,
      presets: limits.defaultTipPresets,
    },
    analytics: {
      provider: observability.analyticsProvider,
      siteId: observability.analyticsSiteId,
      scriptUrl: observability.analyticsScriptUrl,
      sentryDsn: observability.sentryDsn,
    },
    push: {
      enabled: features.pushNotifications,
      // The browser needs this to create a subscription; the private half never leaves the Worker.
      publicKey: features.pushNotifications ? (env.PUSH_VAPID_PUBLIC_KEY ?? null) : null,
    },
    webrtc: {
      // Static STUN/TURN URLs only — short-lived TURN credentials are minted by
      // `GET /api/rtc/ice` so the shared secret never reaches the browser.
      stunUrls: turn.stunUrls,
      turnConfigured: turn.configured,
    },
    integrations: {
      email: emailConfig(env).configured,
      turn: turn.configured,
      captcha: captcha.configured,
      payments: payments.configured,
    },
    environment: env.ENVIRONMENT ?? 'development',
    apiOrigin: origin,
    version: env.APP_VERSION ?? 'dev',
    serverTime: new Date().toISOString(),
  };
}

export type AppConfig = ReturnType<typeof publicConfig>;
