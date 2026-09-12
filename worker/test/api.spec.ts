import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { resolveDeployMode } from '../src/util';
import { api, getTestServer, makeUser, nextMessage, roomSocket, send, type TestServer } from './helpers';

let server: TestServer;

beforeAll(async () => {
  // The Worker serves the built SPA via an assets binding; tests only need a
  // placeholder so wrangler accepts the config.
  const distDir = path.resolve(new URL('..', import.meta.url).pathname, '../dist');
  fs.mkdirSync(distDir, { recursive: true });
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><html><body>placeholder</body></html>');
  }
  server = await getTestServer();
});

afterAll(async () => {
  await server?.stop();
});

describe('health & infra', () => {
  it('reports health with a live D1 binding', async () => {
    const res = await api(server.url, '/api/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; db: boolean };
    expect(body.ok).toBe(true);
    expect(body.db).toBe(true);
  });

  it('serves a valid dynamic sitemap', async () => {
    const res = await api(server.url, '/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('xml');
    const xml = await res.text();
    expect(xml).toContain('<urlset');
    expect(xml).toContain(`${server.url.replace(/\/$/, '')}/`);
  });

  it('adds security headers to API responses and CSP to documents', async () => {
    const res = await api(server.url, '/api/health');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const html = await api(server.url, '/');
    expect(html.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(html.headers.get('x-frame-options')).toBe('DENY');
  });

  it('rejects unknown API routes and unknown methods', async () => {
    expect((await api(server.url, '/api/nope')).status).toBe(404);
    expect((await api(server.url, '/api/health', { method: 'DELETE' })).status).toBe(405);
  });
});

describe('auth', () => {
  it('rejects invalid signup input', async () => {
    const badUsername = await api(server.url, '/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email: 'a@b.com', username: 'x', password: 'longenough1' }),
    });
    expect(badUsername.status).toBe(400);

    const badPassword = await api(server.url, '/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email: 'a@b.com', username: 'okname', password: 'short' }),
    });
    expect(badPassword.status).toBe(400);

    const badEmail = await api(server.url, '/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email: 'not-an-email', username: 'okname', password: 'longenough1' }),
    });
    expect(badEmail.status).toBe(400);
  });

  it('signs up, reads the session, and blocks duplicates', async () => {
    const user = await makeUser(server.url);
    expect(user.cookie).toContain('il_session=');

    const me = await api(server.url, '/api/auth/me', { cookie: user.cookie });
    expect(me.status).toBe(200);
    const { user: meUser } = (await me.json()) as { user: { email: string } };
    expect(meUser.email).toBe(user.email);

    const dupe = await api(server.url, '/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email: user.email, username: `${user.username}x`, password: 'longenough1' }),
    });
    expect(dupe.status).toBe(409);

    const dupeName = await api(server.url, '/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email: `other${user.email}`, username: user.username, password: 'longenough1' }),
    });
    expect(dupeName.status).toBe(409);
  });

  it('logs in with email or username, rejects wrong passwords, and logs out', async () => {
    const user = await makeUser(server.url);

    const wrong = await api(server.url, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identity: user.email, password: 'wrong-password' }),
    });
    expect(wrong.status).toBe(401);

    const byEmail = await api(server.url, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identity: user.email, password: user.password }),
    });
    expect(byEmail.status).toBe(200);

    const byUsername = await api(server.url, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identity: user.username.toUpperCase(), password: user.password }),
    });
    expect(byUsername.status).toBe(200);
    const loginCookie = (byUsername.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

    const logout = await api(server.url, '/api/auth/logout', { method: 'POST', cookie: loginCookie });
    expect(logout.status).toBe(200);
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');

    const afterLogout = await api(server.url, '/api/auth/me', { cookie: loginCookie });
    expect(afterLogout.status).toBe(401);
  });

  it('rejects unauthenticated access to protected endpoints', async () => {
    expect((await api(server.url, '/api/streams/mine')).status).toBe(401);
    expect((await api(server.url, '/api/streams', { method: 'POST', body: JSON.stringify({ title: 'hi there' }) })).status).toBe(401);
    expect((await api(server.url, '/api/sessions')).status).toBe(401);
  });

  it('enforces origin checks on cookie-authenticated mutations', async () => {
    const user = await makeUser(server.url);
    const res = await api(server.url, '/api/streams', {
      method: 'POST',
      cookie: user.cookie,
      headers: { origin: 'https://evil.example' },
      body: JSON.stringify({ title: 'stealth stream' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('streams CRUD & authorization', () => {
  it('creates, reads, updates and deletes a stream with ownership enforced', async () => {
    const owner = await makeUser(server.url);
    const attacker = await makeUser(server.url);

    const created = await api(server.url, '/api/streams', {
      method: 'POST',
      cookie: owner.cookie,
      body: JSON.stringify({ title: 'Night coding session', description: 'chill beats', category: 'Tech', tags: ['code', 'lofi'] }),
    });
    expect(created.status).toBe(201);
    const { stream } = (await created.json()) as { stream: { id: string; title: string; isLive: boolean; tags: string[] } };
    expect(stream.title).toBe('Night coding session');
    expect(stream.isLive).toBe(false);
    expect(stream.tags).toEqual(['code', 'lofi']);

    const bad = await api(server.url, '/api/streams', {
      method: 'POST',
      cookie: owner.cookie,
      body: JSON.stringify({ title: 'no' }),
    });
    expect(bad.status).toBe(400);

    const fetched = await api(server.url, `/api/streams/${stream.id}`);
    expect(fetched.status).toBe(200);
    const { stream: fetchedStream } = (await fetched.json()) as { stream: { host: { username: string } } };
    expect(fetchedStream.host.username).toBe(owner.username);

    const forbiddenPatch = await api(server.url, `/api/streams/${stream.id}`, {
      method: 'PATCH',
      cookie: attacker.cookie,
      body: JSON.stringify({ title: 'hijacked title here' }),
    });
    expect(forbiddenPatch.status).toBe(403);

    const forbiddenStop = await api(server.url, `/api/streams/${stream.id}/stop`, {
      method: 'POST',
      cookie: attacker.cookie,
    });
    expect(forbiddenStop.status).toBe(403);

    const patched = await api(server.url, `/api/streams/${stream.id}`, {
      method: 'PATCH',
      cookie: owner.cookie,
      body: JSON.stringify({ title: 'Late night coding' }),
    });
    expect(patched.status).toBe(200);
    const { stream: patchedStream } = (await patched.json()) as { stream: { title: string } };
    expect(patchedStream.title).toBe('Late night coding');

    const started = await api(server.url, `/api/streams/${stream.id}/start`, { method: 'POST', cookie: owner.cookie });
    expect(started.status).toBe(200);
    const { stream: liveStream } = (await started.json()) as { stream: { isLive: boolean } };
    expect(liveStream.isLive).toBe(true);

    const mine = await api(server.url, '/api/streams/mine', { cookie: owner.cookie });
    const { streams: mineStreams } = (await mine.json()) as { streams: { id: string; isLive: boolean }[] };
    expect(mineStreams.find((s) => s.id === stream.id)?.isLive).toBe(true);

    const liveList = await api(server.url, '/api/streams?live=1');
    const { streams: liveStreams } = (await liveList.json()) as { streams: { id: string }[] };
    expect(liveStreams.some((s) => s.id === stream.id)).toBe(true);

    // Cannot delete while live; can after stopping.
    expect((await api(server.url, `/api/streams/${stream.id}`, { method: 'DELETE', cookie: owner.cookie })).status).toBe(409);
    const stopped = await api(server.url, `/api/streams/${stream.id}/stop`, { method: 'POST', cookie: owner.cookie });
    expect(stopped.status).toBe(200);
    const deleted = await api(server.url, `/api/streams/${stream.id}`, { method: 'DELETE', cookie: owner.cookie });
    expect(deleted.status).toBe(200);
    expect((await api(server.url, `/api/streams/${stream.id}`)).status).toBe(404);
  });
});

describe('profiles & follows', () => {
  it('exposes public profiles and follows/unfollows with counters', async () => {
    const alice = await makeUser(server.url);
    const bob = await makeUser(server.url);

    const profile = await api(server.url, `/api/users/${alice.username}`);
    expect(profile.status).toBe(200);
    const { profile: aliceProfile } = (await profile.json()) as { profile: { username: string; followersCount: number } };
    expect(aliceProfile.username.toLowerCase()).toBe(alice.username);
    expect(aliceProfile.followersCount).toBe(0);

    const follow = await api(server.url, `/api/users/${alice.username}/follow`, { method: 'POST', cookie: bob.cookie });
    expect(follow.status).toBe(200);
    const followBody = (await follow.json()) as { following: boolean; followersCount: number };
    expect(followBody.following).toBe(true);
    expect(followBody.followersCount).toBe(1);

    const selfFollow = await api(server.url, `/api/users/${bob.username}/follow`, { method: 'POST', cookie: bob.cookie });
    expect(selfFollow.status).toBe(400);

    const anonFollow = await api(server.url, `/api/users/${alice.username}/follow`, { method: 'POST' });
    expect(anonFollow.status).toBe(401);

    const unfollow = await api(server.url, `/api/users/${alice.username}/follow`, { method: 'DELETE', cookie: bob.cookie });
    expect(unfollow.status).toBe(200);
    const unfollowBody = (await unfollow.json()) as { following: boolean; followersCount: number };
    expect(unfollowBody.following).toBe(false);
    expect(unfollowBody.followersCount).toBe(0);
  });

  it('updates profile fields with validation', async () => {
    const user = await makeUser(server.url);
    const res = await api(server.url, '/api/users/me', {
      method: 'PATCH',
      cookie: user.cookie,
      body: JSON.stringify({ displayName: 'Nova', bio: 'Streaming the cosmos', socialLinks: [{ platform: 'github', url: 'https://github.com/nova' }] }),
    });
    expect(res.status).toBe(200);
    const { user: updated } = (await res.json()) as { user: { displayName: string; socialLinks: { platform: string }[] } };
    expect(updated.displayName).toBe('Nova');
    expect(updated.socialLinks[0]?.platform).toBe('github');

    const badLink = await api(server.url, '/api/users/me', {
      method: 'PATCH',
      cookie: user.cookie,
      body: JSON.stringify({ socialLinks: [{ platform: 'x', url: 'javascript:alert(1)' }] }),
    });
    expect(badLink.status).toBe(400);
  });
});

describe('recordings (no R2 configured)', () => {
  it('honestly reports when cloud recordings are not configured', async () => {
    const user = await makeUser(server.url);
    const created = await api(server.url, '/api/streams', {
      method: 'POST',
      cookie: user.cookie,
      body: JSON.stringify({ title: 'recording test stream' }),
    });
    const { stream } = (await created.json()) as { stream: { id: string } };
    const form = new FormData();
    form.set('file', new Blob(['abc'], { type: 'video/webm' }), 'rec.webm');
    const res = await api(server.url, `/api/streams/${stream.id}/recording`, {
      method: 'PUT',
      cookie: user.cookie,
      body: form,
    });
    expect(res.status).toBe(501);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('recordings_not_configured');
  });
});

describe('realtime room (WebSocket signaling, presence, chat)', () => {
  it('relays signaling, counts real presence, and fans out chat', async () => {
    const host = await makeUser(server.url);
    const viewer = await makeUser(server.url);
    const created = await api(server.url, '/api/streams', {
      method: 'POST',
      cookie: host.cookie,
      body: JSON.stringify({ title: 'signal test stream', category: 'Talk' }),
    });
    const { stream } = (await created.json()) as { stream: { id: string } };

    // Anonymous user cannot host; owner can.
    const wsUrl = `${server.url.replace('http', 'ws')}/api/room/${stream.id}/ws`;
    const impostor = await roomSocket(wsUrl);
    send(impostor, { type: 'join', role: 'host', token: 'forged-token' });
    expect(await nextMessage(impostor)).toMatchObject({ type: 'rejected', code: 'unauthorized' });
    impostor.close();

    // Start via REST to obtain a room ticket, then join as host with it.
    const startRes = await api(server.url, `/api/streams/${stream.id}/start`, { method: 'POST', cookie: host.cookie });
    expect(startRes.status).toBe(200);
    const { ticket } = (await startRes.json()) as { ticket: string };
    expect(ticket).toBeTruthy();

    const hostWs = await roomSocket(wsUrl);
    send(hostWs, { type: 'join', role: 'host', token: ticket });
    expect(await nextMessage(hostWs)).toMatchObject({ type: 'welcome', role: 'host' });

    // Stream should now be live in the DB (host join reconciles state).
    const fetched = await api(server.url, `/api/streams/${stream.id}`);
    const { stream: liveStream } = (await fetched.json()) as { stream: { isLive: boolean } };
    expect(liveStream.isLive).toBe(true);

    const viewerWs = await roomSocket(wsUrl);
    send(viewerWs, { type: 'join', role: 'viewer' });
    const viewerWelcome = await nextMessage(viewerWs);
    expect(viewerWelcome).toMatchObject({ type: 'welcome', role: 'viewer', hostPresent: true });
    const viewerId = viewerWelcome.viewerId as string;

    const hostSeesViewer = await nextMessage(hostWs);
    expect(hostSeesViewer).toMatchObject({ type: 'viewer-joined', viewerId });
    const presence = await nextMessage(hostWs);
    expect(presence).toMatchObject({ type: 'presence', viewerCount: 1 });

    // Viewer-initiated offer routed to host.
    send(viewerWs, { type: 'signal', to: 'host', payload: { sdp: 'offer-sdp', type: 'offer' } });
    expect(await nextMessage(hostWs)).toMatchObject({ type: 'signal', from: viewerId, payload: { type: 'offer' } });

    // Host answer routed back. (The viewer first drains the join-time presence frame.)
    expect(await nextMessage(viewerWs)).toMatchObject({ type: 'presence', viewerCount: 1 });
    send(hostWs, { type: 'signal', to: viewerId, payload: { sdp: 'answer-sdp', type: 'answer' } });
    expect(await nextMessage(viewerWs)).toMatchObject({ type: 'signal', payload: { type: 'answer' } });

    // Chat is authenticated over REST (session cookie) and fans out over WS.
    const anonChat = await api(server.url, `/api/streams/${stream.id}/chat`, {
      method: 'POST',
      body: JSON.stringify({ text: 'anonymous hello' }),
    });
    expect(anonChat.status).toBe(401);

    const posted = await api(server.url, `/api/streams/${stream.id}/chat`, {
      method: 'POST',
      cookie: viewer.cookie,
      body: JSON.stringify({ text: 'hello from the audience!' }),
    });
    expect(posted.status).toBe(201);
    const hostChat = await nextMessage(hostWs);
    expect(hostChat).toMatchObject({ type: 'chat', text: 'hello from the audience!' });
    const viewerChat = await nextMessage(viewerWs);
    expect(viewerChat).toMatchObject({ type: 'chat', text: 'hello from the audience!' });

    // Chat history persisted via the REST API.
    const chat = await api(server.url, `/api/streams/${stream.id}/chat`);
    const { messages } = (await chat.json()) as { messages: { text: string }[] };
    expect(messages.some((m) => m.text === 'hello from the audience!')).toBe(true);

    // Viewer leaves → host sees it and presence returns to zero.
    viewerWs.close();
    expect(await nextMessage(hostWs)).toMatchObject({ type: 'viewer-left', viewerId });
    expect(await nextMessage(hostWs)).toMatchObject({ type: 'presence', viewerCount: 0 });

    // REST stop force-ends the room: host is notified and stream flips offline.
    send(hostWs, { type: 'ping' });
    expect(await nextMessage(hostWs)).toMatchObject({ type: 'pong' });
    const stopped = await api(server.url, `/api/streams/${stream.id}/stop`, { method: 'POST', cookie: host.cookie });
    expect(stopped.status).toBe(200);
    // The room notifies the host and then closes the socket; either event can
    // be observed first depending on the client transport.
    const endFrame = await nextMessage(hostWs);
    expect(['stream-ended', '__closed__']).toContain(endFrame.type);

    const after = await api(server.url, `/api/streams/${stream.id}`);
    const { stream: endedStream } = (await after.json()) as { stream: { isLive: boolean } };
    expect(endedStream.isLive).toBe(false);

    hostWs.close();
  });

  it('rejects websocket joins for unknown streams', async () => {
    const wsUrl = `${server.url.replace('http', 'ws')}/api/room/doesnotexist/ws`;
    const ws = await roomSocket(wsUrl);
    send(ws, { type: 'join', role: 'viewer' });
    expect(await nextMessage(ws)).toMatchObject({ type: 'rejected', code: 'not_found' });
    ws.close();
  });
});

// ---------------------------------------------------------------------------
// LAN/deploy-mode + call rooms
// ---------------------------------------------------------------------------

describe('deploy mode (LAN detection)', () => {
  it('classifies hosts: private/loopback/.local → lan, public → cloud', async () => {
    const lan = (h: string | null) => resolveDeployMode(h, undefined);
    expect(lan('192.168.1.10:8787')).toBe('lan');
    expect(lan('localhost:5173')).toBe('lan');
    expect(lan('127.0.0.1:8787')).toBe('lan');
    expect(lan('[::1]:8787')).toBe('lan');
    expect(lan('study-pc.local')).toBe('lan');
    expect(lan('10.0.4.2')).toBe('lan');
    expect(lan('172.20.1.9:8787')).toBe('lan');
    expect(lan('imlive.example.workers.dev')).toBe('cloud');
    expect(lan('myapp.vercel.app')).toBe('cloud');
    expect(lan('172.32.1.1')).toBe('cloud'); // just outside the private range
    expect(lan(null)).toBe('cloud');
    // Explicit operator override wins over detection.
    expect(resolveDeployMode('192.168.1.10:8787', 'cloud')).toBe('cloud');
    expect(resolveDeployMode('imlive.example.com', 'lan')).toBe('lan');
  });

  it('reports lan mode with no internet ICE when served on a loopback host', async () => {
    // The test runtime serves on 127.0.0.1 → LAN mode: no STUN, fully offline.
    const res = await api(server.url, '/api/config');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { mode: string; iceServers: unknown[]; categories: string[] };
    expect(body.mode).toBe('lan');
    expect(Array.isArray(body.iceServers)).toBe(true);
    expect(body.iceServers.length).toBe(0); // no internet-dependent ICE in LAN mode
    expect(body.categories.length).toBeGreaterThan(0);
  });
});

describe('call rooms (mesh video calls)', () => {
  it('issues participant tickets only for live call streams', async () => {
    const owner = await makeUser(server.url);
    const guest = await makeUser(server.url);

    // Unauthenticated joins are rejected before anything else.
    const created = await api(server.url, '/api/streams', {
      method: 'POST',
      cookie: owner.cookie,
      body: JSON.stringify({ title: 'design review call', kind: 'call', category: 'Talk' }),
    });
    expect(created.status).toBe(201);
    const { stream } = (await created.json()) as { stream: { id: string; kind: string } };
    expect(stream.kind).toBe('call');

    expect((await api(server.url, `/api/streams/${stream.id}/join-call`, { method: 'POST' })).status).toBe(401);

    // A broadcast-kind stream never issues call tickets.
    const broadcast = await api(server.url, '/api/streams', {
      method: 'POST',
      cookie: owner.cookie,
      body: JSON.stringify({ title: 'plain broadcast here', kind: 'broadcast' }),
    });
    const { stream: bStream } = (await broadcast.json()) as { stream: { id: string; kind: string } };
    expect(bStream.kind).toBe('broadcast');
    const wrongKind = await api(server.url, `/api/streams/${bStream.id}/join-call`, { method: 'POST', cookie: guest.cookie });
    expect(wrongKind.status).toBe(400);
    expect(((await wrongKind.json()) as { error: { code: string } }).error.code).toBe('not_a_call');

    // Offline call: no ticket until the owner starts it.
    const offline = await api(server.url, `/api/streams/${stream.id}/join-call`, { method: 'POST', cookie: guest.cookie });
    expect(offline.status).toBe(409);
    expect(((await offline.json()) as { error: { code: string } }).error.code).toBe('not_live');

    // Owner starts → guests get tickets.
    const start = await api(server.url, `/api/streams/${stream.id}/start`, { method: 'POST', cookie: owner.cookie });
    expect(start.status).toBe(200);
    const guestTicket = await api(server.url, `/api/streams/${stream.id}/join-call`, { method: 'POST', cookie: guest.cookie });
    expect(guestTicket.status).toBe(200);
    const { ticket, ticketExpiresAt } = (await guestTicket.json()) as { ticket: string; ticketExpiresAt: string };
    expect(ticket).toBeTruthy();
    expect(Number.isNaN(Date.parse(ticketExpiresAt))).toBe(false);
  });

  /** (Re)start is idempotent once live — returns a fresh owner ticket each call. */
  async function ownerTicket(streamId: string, cookie: string): Promise<string> {
    const res = await api(server.url, `/api/streams/${streamId}/start`, { method: 'POST', cookie });
    expect(res.status).toBe(200);
    return ((await res.json()) as { ticket: string }).ticket;
  }

  /** Next frame that isn't an idempotent presence update (order-stable drain). */
  async function waitFor(ws: WebSocket, type: string): Promise<Record<string, unknown>> {
    for (;;) {
      const msg = await nextMessage(ws);
      if (msg.type !== 'presence') {
        expect(msg.type).toBe(type);
        return msg;
      }
    }
  }

  it('runs a mesh call: any-to-any signaling, join/leave fan-out, end for all', async () => {
    const owner = await makeUser(server.url);
    const alice = await makeUser(server.url);
    const bob = await makeUser(server.url);

    const created = await api(server.url, '/api/streams', {
      method: 'POST',
      cookie: owner.cookie,
      body: JSON.stringify({ title: 'three-way call', kind: 'call' }),
    });
    const { stream } = (await created.json()) as { stream: { id: string } };
    await api(server.url, `/api/streams/${stream.id}/start`, { method: 'POST', cookie: owner.cookie });
    const ticketFor = async (cookie: string) => {
      const res = await api(server.url, `/api/streams/${stream.id}/join-call`, { method: 'POST', cookie });
      expect(res.status).toBe(200);
      return ((await res.json()) as { ticket: string }).ticket;
    };

    const wsUrl = `${server.url.replace('http', 'ws')}/api/room/${stream.id}/ws`;

    // Viewers are not a thing in calls — join as a participant or nothing.
    const peeker = await roomSocket(wsUrl);
    send(peeker, { type: 'join', role: 'viewer' });
    expect(await nextMessage(peeker)).toMatchObject({ type: 'rejected', code: 'forbidden' });
    peeker.close();

    // Host joins first (empty room).
    const hostWs = await roomSocket(wsUrl);
    send(hostWs, { type: 'join', role: 'host', token: await ownerTicket(stream.id, owner.cookie) });
    const hostWelcome = await nextMessage(hostWs);
    expect(hostWelcome).toMatchObject({ type: 'welcome', role: 'host' });
    expect(hostWelcome.peers).toEqual([]);

    // Alice joins: welcome lists the host; host learns about Alice.
    const aliceWs = await roomSocket(wsUrl);
    send(aliceWs, { type: 'join', role: 'caller', token: await ticketFor(alice.cookie) });
    const aliceWelcome = await nextMessage(aliceWs);
    expect(aliceWelcome).toMatchObject({ type: 'welcome', role: 'caller' });
    expect(aliceWelcome.peers).toEqual([{ id: 'host', username: owner.username, isHost: true }]);
    const aliceId = aliceWelcome.viewerId as string;
    await waitFor(hostWs, 'peer-joined'); // alice announced (order: peer-joined → presence)

    // Alice → host signaling.
    send(aliceWs, { type: 'signal', to: 'host', payload: { type: 'offer', sdp: 'a-offer' } });
    expect(await waitFor(hostWs, 'signal')).toMatchObject({ from: aliceId, payload: { type: 'offer' } });
    // Host → Alice signaling.
    send(hostWs, { type: 'signal', to: aliceId, payload: { type: 'answer', sdp: 'a-answer' } });
    expect(await waitFor(aliceWs, 'signal')).toMatchObject({ payload: { type: 'answer' } });

    // Bob joins: welcome lists BOTH existing participants.
    const bobWs = await roomSocket(wsUrl);
    send(bobWs, { type: 'join', role: 'caller', token: await ticketFor(bob.cookie) });
    const bobWelcome = await nextMessage(bobWs);
    expect(bobWelcome).toMatchObject({ type: 'welcome', role: 'caller' });
    const bobPeers = bobWelcome.peers as { id: string; username: string; isHost: boolean }[];
    expect(bobPeers.map((p) => p.id).sort()).toEqual([aliceId, 'host'].sort());
    const bobId = bobWelcome.viewerId as string;
    // Alice (and the host) learn about Bob.
    const aliceSeesBob = await waitFor(aliceWs, 'peer-joined');
    expect(aliceSeesBob).toMatchObject({ peer: { id: bobId, username: bob.username, isHost: false } });
    await waitFor(hostWs, 'peer-joined'); // the host is told about Bob too

    // Any-to-any: Bob signals Alice directly (not via host).
    send(bobWs, { type: 'signal', to: aliceId, payload: { type: 'offer', sdp: 'b-offer' } });
    expect(await waitFor(aliceWs, 'signal')).toMatchObject({ from: bobId, payload: { sdp: 'b-offer' } });

    // Chat works inside calls for participants.
    const chat = await api(server.url, `/api/streams/${stream.id}/chat`, {
      method: 'POST',
      cookie: bob.cookie,
      body: JSON.stringify({ text: 'can everyone hear me?' }),
    });
    expect(chat.status).toBe(201);
    expect(await waitFor(hostWs, 'chat')).toMatchObject({ text: 'can everyone hear me?' });
    // Every participant receives the fan-out, not just the host.
    expect(await waitFor(bobWs, 'chat')).toMatchObject({ text: 'can everyone hear me?' });

    // Alice leaves → everyone is told.
    aliceWs.close();
    expect(await waitFor(hostWs, 'peer-left')).toMatchObject({ peerId: aliceId });
    expect(await waitFor(bobWs, 'peer-left')).toMatchObject({ peerId: aliceId });

    // Owner stops → the call ends for everyone still in it.
    const stopped = await api(server.url, `/api/streams/${stream.id}/stop`, { method: 'POST', cookie: owner.cookie });
    expect(stopped.status).toBe(200);
    const bobEnd = await waitFor(bobWs, 'stream-ended');
    expect(['stream-ended', '__closed__']).toContain(bobEnd.type);

    const after = await api(server.url, `/api/streams/${stream.id}`);
    expect(((await after.json()) as { stream: { isLive: boolean } }).stream.isLive).toBe(false);

    hostWs.close();
    bobWs.close();
  });

  it('caps mesh calls at eight participants', async () => {
    const owner = await makeUser(server.url);
    const created = await api(server.url, '/api/streams', {
      method: 'POST',
      cookie: owner.cookie,
      body: JSON.stringify({ title: 'full house call', kind: 'call' }),
    });
    const { stream } = (await created.json()) as { stream: { id: string } };
    await api(server.url, `/api/streams/${stream.id}/start`, { method: 'POST', cookie: owner.cookie });

    const wsUrl = `${server.url.replace('http', 'ws')}/api/room/${stream.id}/ws`;
    const sockets: WebSocket[] = [];
    const hostWs = await roomSocket(wsUrl);
    send(hostWs, { type: 'join', role: 'host', token: await ownerTicket(stream.id, owner.cookie) });
    expect(await nextMessage(hostWs)).toMatchObject({ type: 'welcome' });

    // Host + 7 callers fill the room; the 9th participant is rejected.
    for (let i = 0; i < 7; i++) {
      const user = await makeUser(server.url);
      const ws = await roomSocket(wsUrl);
      const res = await api(server.url, `/api/streams/${stream.id}/join-call`, { method: 'POST', cookie: user.cookie });
      expect(res.status).toBe(200);
      const { ticket } = (await res.json()) as { ticket: string };
      send(ws, { type: 'join', role: 'caller', token: ticket });
      const welcome = await nextMessage(ws);
      expect(welcome).toMatchObject({ type: 'welcome', role: 'caller' });
      sockets.push(ws);
    }

    const overflow = await makeUser(server.url);
    const overflowTicket = await api(server.url, `/api/streams/${stream.id}/join-call`, { method: 'POST', cookie: overflow.cookie });
    expect(overflowTicket.status).toBe(200);
    const overflowWs = await roomSocket(wsUrl);
    const { ticket } = (await overflowTicket.json()) as { ticket: string };
    send(overflowWs, { type: 'join', role: 'caller', token: ticket });
    expect(await nextMessage(overflowWs)).toMatchObject({ type: 'rejected', code: 'room_full' });

    overflowWs.close();
    hostWs.close();
    for (const ws of sockets) ws.close();
  });
});
