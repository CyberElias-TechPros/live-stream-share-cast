import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const client = await readFile(new URL('../src/integrations/api/client.ts', import.meta.url), 'utf8');
const worker = await readFile(new URL('../worker/src/index.ts', import.meta.url), 'utf8');
const chat = await readFile(new URL('../src/services/chatService.ts', import.meta.url), 'utf8');
const signal = await readFile(new URL('../src/lib/lanStream.ts', import.meta.url), 'utf8');

assert.doesNotMatch(client, /searchParams\.set\(['"]token['"]/, 'WebSocket URLs must never include bearer credentials');
assert.match(client, /requestWebSocketTicket[\s\S]*?\/ws\/tickets/, 'the client must request short-lived tickets');
assert.match(worker, /if \(!ticket\) throw new ApiError\(401, 'A short-lived WebSocket ticket is required'/, 'Worker upgrades must require a ticket');
assert.match(chat, /requestWebSocketTicket\(streamId, role\)/, 'chat must request a scoped ticket before connecting');
assert.match(signal, /requestWebSocketTicket\(streamId, identity\.role\)/, 'signalling must request a scoped ticket before connecting');

console.log('WebSocket credential contract: passed');
