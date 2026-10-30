/**
 * Validate only the deployment values that are security-critical. This script
 * is intentionally dependency-free so CI can run it before Wrangler deploys.
 */

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const environment = required('ENVIRONMENT');
if (environment.toLowerCase() !== 'production') throw new Error('ENVIRONMENT must be production');

const jwt = required('JWT_SECRET');
if (jwt.length < 32 || /change-me|dev-only/i.test(jwt)) throw new Error('JWT_SECRET must be at least 32 non-placeholder characters');

const cleanup = required('CLEANUP_TOKEN');
if (cleanup.length < 24 || /change-me|dev-only/i.test(cleanup)) throw new Error('CLEANUP_TOKEN must be a strong non-placeholder secret');

const origins = required('ALLOWED_ORIGINS').split(',').map((origin) => origin.trim()).filter(Boolean);
if (!origins.length || origins.includes('*')) throw new Error('ALLOWED_ORIGINS must be an exact comma-separated allow-list');
for (const origin of origins) {
  const url = new URL(origin);
  if (url.protocol !== 'https:') throw new Error(`Production origin must use HTTPS: ${origin}`);
}

const appUrl = required('APP_URL');
if (new URL(appUrl).protocol !== 'https:') throw new Error('APP_URL must use HTTPS in production');

console.log(JSON.stringify({
  ok: true,
  environment,
  origins,
  appUrl,
  secrets: ['JWT_SECRET', 'CLEANUP_TOKEN'],
}));
