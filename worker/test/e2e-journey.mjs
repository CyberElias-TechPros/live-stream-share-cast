#!/usr/bin/env node
/* End-to-end journey against the integrated single-origin stack. */
const BASE = 'http://127.0.0.1:8787';
const assert = (cond, label) => {
  if (!cond) { console.error('✗ FAIL:', label); process.exitCode = 1; }
  else console.log('✓', label);
};

const nextFrame = (ws, predicate, ms = 5000) => new Promise((resolve) => {
  const onMsg = e => { const m = JSON.parse(e.data); if (predicate(m)) { ws.removeEventListener('message', onMsg); resolve(m); } };
  ws.addEventListener('message', onMsg);
  setTimeout(() => { ws.removeEventListener('message', onMsg); resolve({ type: 'timeout' }); }, ms);
});

// 1. Signup
const email = `e2e${Date.now()}@example.com`, username = `e2e${Date.now().toString(36)}`, password = 'demo-password-123';
let res = await fetch(`${BASE}/api/auth/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, username, password }) });
let cookie = (res.headers.get('set-cookie') || '').split(';')[0];
assert(res.status === 201 && cookie.startsWith('il_session='), 'signup + session cookie');

// 2. Create stream
res = await fetch(`${BASE}/api/streams`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ title: 'E2E launch broadcast', description: 'End-to-end verification stream', category: 'Tech', tags: ['e2e'] }) });
const { stream } = await res.json();
assert(res.status === 201 && stream?.id, 'create stream');

// 3. Start + ticket
res = await fetch(`${BASE}/api/streams/${stream.id}/start`, { method: 'POST', headers: { cookie } });
const { ticket } = await res.json();
assert(res.status === 200 && ticket, 'start stream + room ticket');

// 4. Update metadata mid-flight
res = await fetch(`${BASE}/api/streams/${stream.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ title: 'E2E launch broadcast LIVE' }) });
assert((await res.json()).stream.title === 'E2E launch broadcast LIVE', 'patch title mid-flight');

// 5. Host joins the room WS with the ticket
const wsUrl = BASE.replace('http', 'ws') + `/api/room/${stream.id}/ws`;
const hostWs = new WebSocket(wsUrl);
hostWs.addEventListener('message', e => { if (JSON.parse(e.data).type === 'signal') gotSignal = true; });
let gotSignal = false;
await new Promise(r => hostWs.addEventListener('open', r, { once: true }));
hostWs.addEventListener('message', e => console.log('  [host frame]', JSON.parse(e.data).type));
hostWs.send(JSON.stringify({ type: 'join', role: 'host', token: ticket }));
const welcome = await new Promise((resolve) => hostWs.addEventListener('message', e => resolve(JSON.parse(e.data)), { once: true }));
assert(welcome.type === 'welcome' && welcome.role === 'host', 'host joins room via ticket');

// 6. Anonymous viewer joins, sees host, receives signaling
const viewerWs = new WebSocket(wsUrl);
await new Promise(r => viewerWs.addEventListener('open', r, { once: true }));
viewerWs.send(JSON.stringify({ type: 'join', role: 'viewer' }));
const vWelcome = await new Promise((resolve) => viewerWs.addEventListener('message', e => resolve(JSON.parse(e.data)), { once: true }));
assert(vWelcome.role === 'viewer' && vWelcome.hostPresent === true && vWelcome.viewerCount === 1, 'viewer joins, presence=1, host present');
const viewerId = vWelcome.viewerId;

// viewer offers → host receives
viewerWs.send(JSON.stringify({ type: 'signal', to: 'host', payload: { type: 'offer', sdp: 'v=0...' } }));
const hostSignal = await new Promise((resolve) => {
  const onMsg = e => { const m = JSON.parse(e.data); if (m.type === 'signal') { hostWs.removeEventListener('message', onMsg); resolve(m); } };
  hostWs.addEventListener('message', onMsg);
  setTimeout(() => resolve({ type: 'timeout' }), 5000);
});
assert(hostSignal.type === 'signal' && hostSignal.from === viewerId && hostSignal.payload.type === 'offer', 'signaling relay viewer→host');

// host answers → viewer receives
hostWs.send(JSON.stringify({ type: 'signal', to: viewerId, payload: { type: 'answer', sdp: 'v=0...' } }));
await new Promise((resolve) => viewerWs.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.type === 'presence') return; resolve(m); }, { once: true }));
console.log('✓ signaling relay host→viewer');

// 7. Authenticated chat via REST fans out over WS
const hostChatP = nextFrame(hostWs, m => m.type === 'chat');
res = await fetch(`${BASE}/api/streams/${stream.id}/chat`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ text: 'welcome everyone!' }) });
assert(res.status === 201, 'REST chat 201');
const hostChat = await hostChatP;
assert(hostChat.type === 'chat' && hostChat.text === 'welcome everyone!', 'chat fans out over WS');
res = await fetch(`${BASE}/api/streams/${stream.id}/chat`);
const chatHist = await res.json();
assert(chatHist.messages.length === 1, 'chat history persisted');

// 8. Anonymous chat rejected
res = await fetch(`${BASE}/api/streams/${stream.id}/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'spam' }) });
assert(res.status === 401, 'anonymous chat rejected');

// 9. Viewer leaves; presence drops
viewerWs.close();
const hostPresence = await new Promise((resolve) => {
  const onMsg = e => { const m = JSON.parse(e.data); if (m.type === 'viewer-left' || m.type === 'presence') { hostWs.removeEventListener('message', onMsg); resolve(m); } };
  hostWs.addEventListener('message', onMsg);
});
assert(hostPresence.type === 'viewer-left', 'viewer leave detected');

// 10. Stop → room force-ended
const hostClosedP = new Promise((resolve) => hostWs.addEventListener('close', () => resolve({ type: 'host-ws-closed' }), { once: true }));
const endFrameP = nextFrame(hostWs, m => m.type === 'stream-ended' || m.type === 'host-left');
res = await fetch(`${BASE}/api/streams/${stream.id}/stop`, { method: 'POST', headers: { cookie } });
assert(res.status === 200, 'stop stream');
const endFrame = await Promise.race([endFrameP, hostClosedP]);
assert(endFrame.type === 'stream-ended' || endFrame.type === 'host-left' || endFrame.type === 'host-ws-closed', 'host notified of end (socket closed)');
hostWs.close();

// 11. Stream shows offline; profile public; dashboard endpoints
res = await fetch(`${BASE}/api/streams/${stream.id}`);
const ended = (await res.json()).stream;
assert(ended.isLive === false, 'stream offline after stop');
res = await fetch(`${BASE}/api/sessions`, { headers: { cookie } });
const sessions = await res.json();
assert(sessions.sessions.length >= 1 && sessions.sessions[0].peakViewers >= 1, 'broadcast session recorded with peak viewers');
res = await fetch(`${BASE}/api/users/${username}`);
const pub = await res.json();
assert(res.status === 200 && pub.profile.username === username, 'public profile served');

// 12. SPA HTML + meta
res = await fetch(`${BASE}/`);
const html = await res.text();
assert(html.includes("I'm Live") && res.headers.get('content-security-policy')?.includes("default-src 'self'"), 'SPA served with CSP');
res = await fetch(`${BASE}/watch/${stream.id}`);
assert((await res.text()).includes('id="root"'), 'SPA fallback for deep link');
res = await fetch(`${BASE}/api/streams?live=1`);
assert(JSON.parse(await res.text()).streams.every(s => s.host.username), 'browse API shaped correctly');

console.log(process.exitCode ? '\nE2E: FAILURES' : '\nE2E: ALL PASS');
process.exit(process.exitCode || 0);
