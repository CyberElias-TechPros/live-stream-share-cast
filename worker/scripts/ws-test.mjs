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
const memberEmail = `wstest-member${suffix}@example.com`;
const memberUsername = `wstestmember${suffix}`;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Waits for a condition instead of guessing a fixed delay — the first run after
 * a worker start is noticeably slower, which used to fail the suite.
 */
async function waitFor(predicate, { timeout = 4000, interval = 150 } = {}) {
  const deadline = Date.now() + timeout;
  let result = await predicate();
  while (!result && Date.now() < deadline) {
    await wait(interval);
    result = await predicate();
  }
  return Boolean(result);
}

async function ticket(streamId, role, token) {
  const response = await fetch(`${API}/ws/tickets`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ streamId, role }),
  });
  const body = await response.json();
  if (!response.ok || !body.ticket) throw new Error(`ticket request failed (${response.status}): ${JSON.stringify(body)}`);
  return body.ticket;
}

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
    send: (payload) => ws.send(typeof payload === 'string' ? payload : JSON.stringify(payload)),
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

  const memberSignup = await fetch(`${API}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: memberUsername, email: memberEmail, password: 'supersecret1' }),
  }).then((r) => r.json());
  const memberToken = memberSignup.accessToken;

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

  await fetch(`${API}/streams/${streamId}/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({}),
  });

  console.log('2) host connects to the chat room');
  const hostTicket = await ticket(streamId, 'host', token);
  const host = socket(`/api/ws/chat/${streamId}?role=host&ticket=${encodeURIComponent(hostTicket)}`, 'host');
  await host.open();
  await wait(300);

  console.log('3) anonymous viewer connects');
  const viewerTicket = await ticket(streamId, 'viewer');
  const viewer = socket(`/api/ws/chat/${streamId}?role=viewer&ticket=${encodeURIComponent(viewerTicket)}`, 'viewer');
  await viewer.open();

  console.log('4) authenticated viewer joins and receives the same room policy');
  const memberTicket = await ticket(streamId, 'viewer', memberToken);
  const member = socket(`/api/ws/chat/${streamId}?role=viewer&ticket=${encodeURIComponent(memberTicket)}`, 'member');
  await member.open();
  await waitFor(() => host.has('presence', (m) => m.viewers >= 2));

  console.log('5) host sends a chat message over the socket');
  host.send({ type: 'chat', message: 'welcome to the stream' });
  await waitFor(() => viewer.has('chat', (m) => m.message?.message === 'welcome to the stream'));

  member.send({ type: 'chat', message: 'hello from the authenticated viewer' });
  await waitFor(() => host.has('chat', (m) => m.message?.message === 'hello from the authenticated viewer'));

  console.log('6) viewer (anonymous) tries to chat — must be rejected');
  viewer.send({ type: 'chat', message: 'hi' });
  await wait(300);

  console.log('7) a blocked-word rule is enforced on the WebSocket path');
  await fetch(`${API}/moderation/chat/${streamId}/settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ blockedWords: ['forbiddenphrase'] }),
  });
  member.send({ type: 'chat', message: 'this contains forbiddenphrase' });
  await waitFor(() => member.has('error', (m) => m.code === 'blocked_word'));
  member.send('x'.repeat(70_000));
  await waitFor(() => member.has('error', (m) => m.code === 'frame_too_large'));
  member.send({ type: 'chat', message: 'system labels are reserved', messageType: 'system' });
  await waitFor(() => member.has('chat', (m) => m.message?.message === 'system labels are reserved' && m.message?.type === 'text'));

  const presence = await fetch(`${API}/streams/${streamId}/presence`).then((r) => r.json());
  console.log(`   presence: ${JSON.stringify(presence)}`);

  const dbState = await fetch(`${API}/streams/${streamId}`).then((r) => r.json());
  console.log(`   stream isLive=${dbState.stream.isLive} hostConnected=${dbState.stream.hostConnected}`);

  console.log('8) REST chat message is fanned out to both sockets');
  await fetch(`${API}/streams/${streamId}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ message: 'sent over HTTP' }),
  });
  await wait(400);

  console.log('7) WebRTC signalling: viewer offer → host');
  const hostSignalTicket = await ticket(streamId, 'host', token);
  const hostSignal = socket(`/api/ws/signal/${streamId}?role=host&peerId=host-1&ticket=${encodeURIComponent(hostSignalTicket)}`, 'signal:host');
  await hostSignal.open();
  const viewerSignalTicket = await ticket(streamId, 'viewer');
  const viewerSignal = socket(`/api/ws/signal/${streamId}?role=viewer&peerId=viewer-1&ticket=${encodeURIComponent(viewerSignalTicket)}`, 'signal:viewer');
  await viewerSignal.open();
  await wait(300);

  viewerSignal.send({ type: 'offer', to: 'host-1', sdp: { type: 'offer', sdp: 'FAKE_SDP' } });
  await wait(300);
  hostSignal.send({ type: 'answer', to: 'viewer-1', sdp: { type: 'answer', sdp: 'FAKE_SDP' } });
  await wait(300);

  // The player's quality menu asks the host to cap the bitrate it sends that
  // viewer; the request must survive the signalling relay intact.
  viewerSignal.send({ type: 'quality', to: 'host-1', kbps: 1200 });
  await wait(300);

  console.log('8) malformed and role-incompatible signalling frames are rejected');
  viewerSignal.send({ type: 'streamer-ready' });
  viewerSignal.send({ type: 'offer', to: 'host-1', sdp: { type: 'offer', sdp: '' } });
  viewerSignal.send({ type: 'quality', to: 'host-1', kbps: 1 });
  await waitFor(() =>
    viewerSignal.has('error', (m) => m.code === 'invalid_role_frame') &&
      viewerSignal.has('error', (m) => m.code === 'invalid_sdp') &&
      viewerSignal.has('error', (m) => m.code === 'invalid_quality'),
  );

  console.log('9) P2P capacity rejects the ninth viewer');
  const capacityViewers = [];
  for (let index = 2; index <= 8; index += 1) {
    const peerTicket = await ticket(streamId, 'viewer');
    const peer = socket(`/api/ws/signal/${streamId}?role=viewer&peerId=viewer-${index}&ticket=${encodeURIComponent(peerTicket)}`, `signal:viewer-${index}`);
    capacityViewers.push(peer);
    await peer.open();
  }
  const rejectedTicket = await ticket(streamId, 'viewer');
  const capacityRejected = socket(`/api/ws/signal/${streamId}?role=viewer&peerId=viewer-9&ticket=${encodeURIComponent(rejectedTicket)}`, 'signal:viewer-9');
  await capacityRejected.open();
  await waitFor(() => capacityRejected.has('error', (message) => message.code === 'p2p_capacity'));

  console.log('9) host disconnects — stream should go offline');
  capacityRejected.close();
  for (const peer of capacityViewers) peer.close();
  await wait(300);
  host.close();
  await waitFor(async () => {
    const state = await fetch(`${API}/streams/${streamId}`).then((r) => r.json());
    return state?.stream?.isLive === false;
  }, { timeout: 5000 });
  const after = await fetch(`${API}/streams/${streamId}`).then((r) => r.json());
  console.log(`   stream isLive=${after.stream.isLive} hostConnected=${after.stream.hostConnected}`);

  viewer.close();
  member.close();
  viewerSignal.close();
  hostSignal.close();
  await wait(300);

  /* ------------------------------- assertions -------------------------------- */
  const results = [
    ['host received ready', host.has('ready')],
    ['host saw the viewers join (presence)', host.inbox.some((m) => m.type === 'presence' && m.viewers >= 2)],
    ['host chat broadcast reached viewer', viewer.has('chat', (m) => m.message?.message === 'welcome to the stream')],
    ['authenticated viewer chat broadcast reached host', host.has('chat', (m) => m.message?.message === 'hello from the authenticated viewer')],
    ['anonymous chat rejected', viewer.has('error', (m) => m.code === 'auth_required')],
    ['blocked words rejected on WebSocket chat', member.has('error', (m) => m.code === 'blocked_word')],
    ['oversized chat frames rejected', member.has('error', (m) => m.code === 'frame_too_large')],
    ['viewer cannot forge a system chat message', member.has('chat', (m) => m.message?.message === 'system labels are reserved' && m.message?.type === 'text')],
    ['REST chat fanned out', viewer.has('chat', (m) => m.message?.message === 'sent over HTTP')],
    ['presence counted the viewers', presence.viewers === 2],
    ['host marked stream live', dbState.stream.isLive === true && dbState.stream.hostConnected === true],
    ['signalling welcome delivered', hostSignal.has('welcome') && viewerSignal.has('welcome')],
    ['offer relayed to host', hostSignal.has('offer', (m) => m.to === 'host-1')],
    ['answer relayed to viewer', viewerSignal.has('answer', (m) => m.to === 'viewer-1')],
    ['quality hint relayed to the host', hostSignal.has('quality', (m) => m.kbps === 1200)],
    ['the relay stamps the real sender id', hostSignal.inbox.some((m) => m.type === 'quality' && m.from === 'viewer-1')],
    ['invalid signalling role/SDP/quality frames rejected',
      viewerSignal.has('error', (m) => m.code === 'invalid_role_frame') &&
      viewerSignal.has('error', (m) => m.code === 'invalid_sdp') &&
      viewerSignal.has('error', (m) => m.code === 'invalid_quality')],
    ['P2P capacity rejects the ninth viewer', capacityRejected.has('error', (m) => m.code === 'p2p_capacity' && m.maxViewers === 8)],
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
