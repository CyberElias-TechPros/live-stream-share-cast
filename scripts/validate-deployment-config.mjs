import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const worker = await readFile(new URL('../worker/wrangler.jsonc', import.meta.url), 'utf8');
const headers = vercel.headers?.find((entry) => entry.source === '/(.*)')?.headers ?? [];
const values = Object.fromEntries(headers.map(({ key, value }) => [key.toLowerCase(), value]));

for (const key of ['content-security-policy', 'referrer-policy', 'x-content-type-options', 'x-frame-options', 'permissions-policy', 'strict-transport-security']) {
  assert.ok(values[key], `Vercel must set ${key}`);
}
assert.match(values['content-security-policy'], /default-src 'self'/);
assert.match(values['content-security-policy'], /frame-ancestors 'none'/);
assert.match(values['content-security-policy'], /https:\/\/challenges\.cloudflare\.com/);
assert.match(values['content-security-policy'], /https:\/\/\*\.hcaptcha\.com/);
assert.match(values['content-security-policy'], /https:\/\/fonts\.googleapis\.com/);
assert.match(values['content-security-policy'], /stun: stuns: turn: turns:/, 'CSP must allow WebRTC ICE transports');
assert.match(worker, /"name": "RATE_LIMITER", "class_name": "RateLimitRoom"/);
assert.match(worker, /"tag": "v2", "new_sqlite_classes": \["RateLimitRoom"\]/);

console.log('deployment security headers and rate-limit binding: passed');
