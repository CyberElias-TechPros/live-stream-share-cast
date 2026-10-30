import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = {
  protocol: await readFile('src/lib/offlinePeer.ts', 'utf8'),
  ui: await readFile('src/components/OfflineBrowserRoom.tsx', 'utf8'),
  app: await readFile('src/App.tsx', 'utf8'),
  worker: await readFile('public/push-sw.js', 'utf8'),
  docs: await readFile('docs/OFFLINE-LAN.md', 'utf8'),
};

assert.match(files.protocol, /OFFLINE_SIGNAL_PROTOCOL = "imlive-offline-webrtc"/);
assert.match(files.protocol, /iceServers:\s*\[\]/);
assert.match(files.protocol, /acceptOfflineOfferAndCreateAnswer/);
assert.match(files.protocol, /acceptOfflineAnswer/);
assert.doesNotMatch(files.protocol, /integrations\/api|requestWebSocketTicket|apiSocket|platformService/);
assert.match(files.ui, /No Worker, API, STUN, TURN, CDN/);
assert.match(files.ui, /getUserMedia/);
assert.match(files.ui, /copyText/);
assert.match(files.app, /path="\/offline"/);
assert.match(files.worker, /!url\.pathname\.startsWith\('\/api\/'\)/);
assert.match(files.worker, /request\.destination !== 'video'/);
assert.match(files.docs, /Android ↔ Android/);
assert.match(files.docs, /Browser ↔ browser setup/);

console.log('offline-room contract: passed');
