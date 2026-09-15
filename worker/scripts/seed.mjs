/**
 * Seeds the local D1 database with demo data through the public API, so the
 * browse/dashboard/profile pages have something to show.
 *
 * Usage: npm run seed   (requires `wrangler dev` on :8787)
 *        node scripts/seed.mjs http://127.0.0.1:8787
 */
const BASE = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const API = `${BASE}/api`;
const PASSWORD = 'demo1234';

async function call(path, { method = 'POST', body, token } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status} ${data.error ?? ''}`);
  return data;
}

async function signup(username) {
  try {
    return await call('/auth/signup', { body: { username, email: `${username}@demo.live`, password: PASSWORD } });
  } catch (error) {
    // Already exists (e.g. re-running the seed) — just log in.
    if (!/email_taken|username_taken/.test(error.message)) throw error;
    return call('/auth/login', { body: { email: `${username}@demo.live`, password: PASSWORD } });
  }
}

async function main() {
  console.log(`seeding ${API}`);

  const streamers = [];
  for (const username of ['aria', 'nova', 'kai']) {
    const session = await signup(username);
    await call('/users/me/streamer', { body: { isStreamer: true }, token: session.accessToken });
    streamers.push({ username, ...session });
    console.log(`  ✓ user ${username} (${PASSWORD})`);
  }

  const viewer = await signup('viewer');
  console.log(`  ✓ user viewer (${PASSWORD})`);

  const blueprints = [
    {
      owner: 0,
      title: 'Sunset rooftop set — Lagos',
      description: 'Two hours of afro-house from the roof. Requests open in chat.',
      category: 'Music',
      tags: ['afrohouse', 'lagos', 'live'],
      streamType: 'internet',
      goLive: true,
      viewers: 128,
      chat: ['this mix is unreal 🔥', 'turn the bass up!', 'first time catching you live — incredible'],
    },
    {
      owner: 0,
      title: 'Building a WebRTC app, live',
      description: 'Pair-programming the signalling layer. Ask anything.',
      category: 'Software & Game Development',
      tags: ['webrtc', 'typescript', 'coding'],
      streamType: 'local',
      goLive: true,
      viewers: 42,
      chat: ['what TURN provider are you using?', 'DOs are perfect for this'],
    },
    {
      owner: 1,
      title: 'Late night pixel art jam',
      description: 'Drawing a tiny city skyline, one tile at a time.',
      category: 'Art',
      tags: ['pixelart', 'chill'],
      streamType: 'internet',
      goLive: true,
      viewers: 17,
      chat: ['the palette is gorgeous', 'how long does a tile take?'],
    },
    {
      owner: 1,
      title: 'Morning stretch & mobility',
      description: 'Replay from yesterday’s session.',
      category: 'Fitness',
      tags: ['mobility', 'replay'],
      streamType: 'internet',
      goLive: false,
      viewers: 0,
      chat: [],
    },
    {
      owner: 2,
      title: 'Speedrun attempts until I beat it',
      description: 'Any% no major glitches. Chat picks the next category.',
      category: 'Gaming',
      tags: ['speedrun', 'gaming'],
      streamType: 'internet',
      goLive: true,
      viewers: 63,
      chat: ['PB incoming', 'that trick jump was clean'],
    },
  ];

  const created = [];
  for (const blueprint of blueprints) {
    const owner = streamers[blueprint.owner];
    const { stream } = await call('/streams', {
      token: owner.accessToken,
      body: {
        title: blueprint.title,
        description: blueprint.description,
        category: blueprint.category,
        tags: blueprint.tags,
        streamType: blueprint.streamType,
        isRecording: false,
      },
    });

    if (blueprint.goLive) {
      await call(`/streams/${stream.id}/start`, { token: owner.accessToken, body: { isRecording: false } });
      await call(`/streams/${stream.id}/viewers`, { body: { count: blueprint.viewers } });
    }

    for (const message of blueprint.chat) {
      const author = Math.random() > 0.5 ? viewer : streamers[(blueprint.owner + 1) % streamers.length];
      await call(`/streams/${stream.id}/chat`, { token: author.accessToken, body: { message } }).catch(() => undefined);
    }

    created.push({ ...blueprint, stream });
    console.log(`  ✓ stream "${stream.title}" ${blueprint.goLive ? '(live)' : '(ended)'}`);
  }

  // Follow graph so the profile page has something to render.
  await call(`/users/${streamers[0].user.id}/follow`, { method: 'PUT', token: viewer.accessToken }).catch(() => undefined);
  await call(`/users/${streamers[1].user.id}/follow`, { method: 'PUT', token: viewer.accessToken }).catch(() => undefined);
  await call(`/users/${streamers[0].user.id}/follow`, { method: 'PUT', token: streamers[1].accessToken }).catch(() => undefined);
  console.log('  ✓ follows');

  console.log(`
Done. Sign in with any of:
  aria@demo.live / ${PASSWORD}   (3 streams)
  nova@demo.live / ${PASSWORD}   (2 streams)
  kai@demo.live  / ${PASSWORD}   (1 stream)
  viewer@demo.live / ${PASSWORD} (follows two channels)

Live stream ids:
${created
  .filter((item) => item.goLive)
  .map((item) => `  ${item.stream.id}  ${item.stream.title}`)
  .join('\n')}
`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
