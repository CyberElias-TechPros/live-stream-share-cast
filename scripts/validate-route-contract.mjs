import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const route = (path) => {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = app.match(new RegExp(`<Route path="${escaped}" element={(\\s*[\\s\\S]*?)}\\s*/>`));
  assert.ok(match, `Route ${path} must exist`);
  return match[1];
};

assert.match(route('/profile/:username'), /<Profile\s*\/>/, 'public creator profile should render without a login redirect');
assert.doesNotMatch(route('/profile/:username'), /<ProtectedRoute/, 'public creator profile must remain guest-accessible');
assert.match(route('/stream/create'), /<ProtectedRoute[\s\S]*requireStreamer/, 'stream creation must remain streamer-protected');
assert.match(route('/dashboard'), /<ProtectedRoute/, 'creator dashboard must remain authenticated');
assert.match(route('/admin'), /<ProtectedRoute/, 'admin UI must remain behind an authenticated route');

console.log('route visibility contract: passed');
