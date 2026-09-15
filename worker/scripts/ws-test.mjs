/**
 * End-to-end check of the realtime layer:
 *   • chat WebSocket (presence, fan-out, moderation)
 *   • WebRTC signalling WebSocket (offer / answer relay)
 *
 * Usage: node scripts/ws-test.mjs [apiBase]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const API = `${BASE}/api`;
const WS = BASE.replace(/^http/, 'ws');

const suffix = Math.floor(Math.random() * 1_000_000);
const email = `wstest${suffix}@example.com`;
const username = `wstest${suffix}`;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function socket(path, label) {
  const ws = new WebSocket(`${WS}${path}`);
  const inbox = [];
  ws.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    inbox.push(data);
    console.log(`   ↳ [${label}] ${JSON.stringify(data).slice(0, 160)}`);
  });
  ws.addEventListener('error', (event) => console.log(`   ! [${label}] error`, event.message ?? ''));
  ws.addEventListener('close', (event) => console.log(`   · [${label}] closed (${event.code})`));
  return {
    ws,
    inbox,
    open: () => new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error(`${label} failed to open`)), { once: true });
    }),
    send: (payload) => ws.send(JSON.stringify(payload)),
    has: (type, predicate = () => true) => inbox.some((m) => m.type === type && predicate(m)),
    close: () => ws.close(),
  };
}

async function main() {
  console.log(`1) create account ${username}`);
  const signup = await fetch(`${API}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, email, password: 'supersecret1' }),
  }).then((r) => r.json());
  const token = signup.accessToken;

  await fetch(`${API}/users/me/streamer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ isStreamer: true }),
  });

  const created = await fetch(`${API}/streams`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ title: 'Realtime test', category: 'Tech', tags: ['ws'], streamType: 'internet' }),
  }).then((r) => r.json());
  const streamId = created.stream.id;
  console.log(`   stream ${streamId}`);

  console.log('2) host connects to the chat room');
  const host = socket(`/api/ws/chat/${streamId}?role=host&token=${token}`, 'host');
  await host.open();
  await wait(300);

  console.log('3) anonymous viewer connects');
  const viewer = socket(`/api/ws/chat/${streamId}`, 'viewer');
  await viewer.open();
  await wait(300);

  console.log('4) host sends a chat message over the socket');
  host.send({ type: 'chat', message: 'welcome to the stream' });
  await wait(400);

  console.log('5) viewer (anonymous) tries to chat — must be rejected');
  viewer.send({ type: 'chat', message: 'hi' });
  await wait(300);

  const presence = await fetch(`${API}/streams/${streamId}/presence`).then((r) => r.json());
  console.log(`   presence: ${JSON.stringify(presence)}`);

  const dbState = await fetch(`${API}/streams/${streamId}`).then((r) => r.json());
  console.log(`   stream isLive=${dbState.stream.isLive} hostConnected=${dbState.stream.hostConnected}`);

  console.log('6) REST chat message is fanned out to both sockets');
  await fetch(`${API}/streams/${streamId}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ message: 'sent over HTTP' }),
  });
  await wait(400);

  console.log('7) WebRTC signalling: viewer offer → host');
  const hostSignal = socket(`/api/ws/signal/${streamId}?role=host&peerId=host-1&token=${token}`, 'signal:host');
  await hostSignal.open();
  const viewerSignal = socket(`/api/ws/signal/${streamId}?peerId=viewer-1`, 'signal:viewer');
  await viewerSignal.open();
  await wait(300);

  viewerSignal.send({ type: 'offer', to: 'host-1', sdp: { type: 'offer', sdp: 'FAKE_SDP' } });
  await wait(300);
  hostSignal.send({ type: 'answer', to: 'viewer-1', sdp: { type: 'answer', sdp: 'FAKE_SDP' } });
  await wait(300);

  console.log('8) host disconnects — stream should go offline');
  host.close();
  await wait(800);
  const after = await fetch(`${API}/streams/${streamId}`).then((r) => r.json());
  console.log(`   stream isLive=${after.stream.isLive} hostConnected=${after.stream.hostConnected}`);

  viewer.close();
  viewerSignal.close();
  hostSignal.close();
  await wait(300);

  /* ------------------------------- assertions -------------------------------- */
  const results = [
    ['host received ready', host.has('ready')],
    ['host saw the viewer join (presence)', host.inbox.some((m) => m.type === 'presence' && m.viewers >= 1)],
    ['host chat broadcast reached viewer', viewer.has('chat', (m) => m.message?.message === 'welcome to the stream')],
    ['anonymous chat rejected', viewer.has('error')],
    ['REST chat fanned out', viewer.has('chat', (m) => m.message?.message === 'sent over HTTP')],
    ['presence counted the viewer', presence.viewers === 1],
    ['host marked stream live', dbState.stream.isLive === true && dbState.stream.hostConnected === true],
    ['signalling welcome delivered', hostSignal.has('welcome') && viewerSignal.has('welcome')],
    ['offer relayed to host', hostSignal.has('offer', (m) => m.to === 'host-1')],
    ['answer relayed to viewer', viewerSignal.has('answer', (m) => m.to === 'viewer-1')],
    ['stream offline after host left', after.stream.isLive === false],
  ];

  console.log('\n--- results ---');
  let failures = 0;
  for (const [name, passed] of results) {
    if (!passed) failures += 1;
    console.log(`${passed ? '✅' : '❌'} ${name}`);
  }
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
