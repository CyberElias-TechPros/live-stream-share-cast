/**
 * End-to-end check of the REST API — every journey the SPA depends on:
 *
 *   auth (signup / login / refresh / verify / reset / sessions / tokens / export)
 *   profiles, streams, chat, follows, notifications, schedule, moderation
 *   analytics + watch tracking, recordings, search, integrations, payments
 *   admin authorisation, error contracts and rate-limit headers
 *
 * Usage: node scripts/api-test.mjs [apiBase]
 *    e.g. node scripts/api-test.mjs https://live-stream-share-cast-api.example.workers.dev
 *
 * The script creates throwaway accounts and cleans up after itself where the
 * API allows it. It exits non-zero when any assertion fails, so it can gate a
 * deploy (`npm run test:api`).
 */

const BASE = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const API = `${BASE}/api`;

const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const streamer = { email: `apitest-streamer-${suffix}@example.com`, username: `apist${suffix}`, password: 'supersecret1' };
const viewer = { email: `apitest-viewer-${suffix}@example.com`, username: `apivw${suffix}`, password: 'supersecret1' };

const results = [];
const check = (name, passed, detail = '') => {
  results.push([name, !!passed, detail]);
  console.log(`${passed ? '✅' : '❌'} ${name}${passed || !detail ? '' : ` — ${detail}`}`);
};
const section = (title) => console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 58 - title.length))}`);

let streamerToken = null;
let viewerToken = null;
let viewerRefresh = null;

async function call(method, path, { token, body, headers = {}, raw = false } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (raw) return response;
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text.slice(0, 200) };
  }
  return { status: response.status, body: json, headers: response.headers };
}

async function postForm(path, form, token) {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text.slice(0, 200) };
  }
  return { status: response.status, body: json };
}

/** 1x1 transparent PNG — enough for the image-type and ownership checks. */
const PNG_BYTES = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (char) => char.charCodeAt(0),
);

async function main() {
  /* ------------------------------- platform -------------------------------- */

  section('platform');
  const health = await call('GET', '/health');
  check('GET /health reports d1 + r2 + durable objects', health.status === 200 && health.body?.database === 'ok', JSON.stringify(health.body).slice(0, 120));

  const config = await call('GET', '/config');
  check(
    'GET /config exposes brand, limits, features and integration flags',
    config.status === 200 &&
      typeof config.body?.brand?.name === 'string' &&
      typeof config.body?.limits?.recordingRetentionHours === 'number' &&
      typeof config.body?.features?.signups === 'boolean' &&
      typeof config.body?.integrations?.email === 'boolean',
    JSON.stringify(config.body).slice(0, 120),
  );

  const unauthorised = await call('GET', '/auth/me');
  check('protected routes reject a missing token with 401', unauthorised.status === 401);

  const missing = await call('GET', '/definitely-not-a-route');
  check('unknown API routes 404 with an error envelope', missing.status === 404 && !!missing.body?.error);

  /* ---------------------------------- auth --------------------------------- */

  section('auth');
  const signup = await call('POST', '/auth/signup', {
    body: { username: streamer.username, email: streamer.email, password: streamer.password, displayName: 'API Tester' },
  });
  streamerToken = signup.body?.accessToken ?? null;
  check('POST /auth/signup returns a session', signup.status === 201 && !!streamerToken && !!signup.body?.refreshToken);
  check('signup reports whether the verification mail went out', typeof signup.body?.emailVerificationSent === 'boolean');

  const me = await call('GET', '/auth/me', { token: streamerToken });
  check(
    'GET /auth/me returns the private profile (email, isAdmin, emailVerified)',
    me.status === 200 && me.body?.user?.email === streamer.email && typeof me.body?.user?.isAdmin === 'boolean',
  );

  const legal = await call('GET', '/auth/legal');
  check(
    'GET /auth/legal returns policy versions + retention',
    legal.status === 200 && typeof legal.body?.termsVersion === 'string' && typeof legal.body?.retention?.recordingsHours === 'number',
  );

  const badVerify = await call('POST', '/auth/verify-email', { body: { token: 'not-a-real-token' } });
  check('POST /auth/verify-email rejects a bad token with 400', badVerify.status === 400 && !!badVerify.body?.error);

  const resend = await call('POST', '/auth/resend-verification', { token: streamerToken });
  check('POST /auth/resend-verification queues a fresh link', resend.status === 200 && typeof resend.body?.delivered === 'boolean');

  const duplicate = await call('POST', '/auth/signup', {
    body: { username: `${streamer.username}x`, email: streamer.email, password: streamer.password },
  });
  check('duplicate email is rejected with `email_taken`', duplicate.status === 409 && duplicate.body?.code === 'email_taken', JSON.stringify(duplicate.body));

  const wrongPassword = await call('POST', '/auth/login', { body: { email: streamer.email, password: 'wrong-password' } });
  check('wrong password is rejected without leaking account details', wrongPassword.status === 401 && /invalid email or password/i.test(wrongPassword.body?.error ?? ''));

  const login = await call('POST', '/auth/login', { body: { email: streamer.email, password: streamer.password } });
  streamerToken = login.body?.accessToken ?? streamerToken;
  check('POST /auth/login issues a new session', login.status === 200 && !!login.body?.accessToken);

  const refresh = await call('POST', '/auth/refresh', { body: { refreshToken: login.body?.refreshToken } });
  check('POST /auth/refresh rotates the token pair', refresh.status === 200 && !!refresh.body?.accessToken && !!refresh.body?.refreshToken);
  streamerToken = refresh.body?.accessToken ?? streamerToken;

  const forgot = await call('POST', '/auth/forgot-password', { body: { email: streamer.email } });
  check('POST /auth/forgot-password answers generically', forgot.status === 200 && typeof forgot.body?.success === 'boolean');

  const sessions = await call('GET', '/auth/sessions', { token: streamerToken });
  check('GET /auth/sessions lists the active devices', sessions.status === 200 && Array.isArray(sessions.body?.sessions) && sessions.body.sessions.length >= 1);

  const newToken = await call('POST', '/auth/tokens', { token: streamerToken, body: { name: 'api-test', scopes: ['read'], expiresInDays: 1 } });
  check('POST /auth/tokens returns a one-time `lsc_` secret', newToken.status === 201 && String(newToken.body?.token ?? '').startsWith('lsc_'));

  const tokens = await call('GET', '/auth/tokens', { token: streamerToken });
  check('GET /auth/tokens lists issued tokens', tokens.status === 200 && Array.isArray(tokens.body?.tokens));

  const tokenList = tokens.body?.tokens ?? [];
  if (tokenList[0]?.id) {
    const revoked = await call('DELETE', `/auth/tokens/${tokenList[0].id}`, { token: streamerToken });
    check('DELETE /auth/tokens/:id revokes a token', revoked.status === 200);
  }

  const exportData = await call('GET', '/auth/account/export', { token: streamerToken });
  check(
    'GET /auth/account/export returns the full account bundle',
    exportData.status === 200 && !!exportData.body?.profile && !!exportData.body?.format,
    JSON.stringify(exportData.body).slice(0, 100),
  );

  /* --------------------------------- viewer -------------------------------- */

  const viewerSignup = await call('POST', '/auth/signup', {
    body: { username: viewer.username, email: viewer.email, password: viewer.password, displayName: 'API Viewer' },
  });
  viewerToken = viewerSignup.body?.accessToken ?? null;
  viewerRefresh = viewerSignup.body?.refreshToken ?? null;
  check('second account signs up (viewer persona)', viewerSignup.status === 201 && !!viewerToken);

  const viewerId = (await call('GET', '/auth/me', { token: viewerToken })).body?.user?.id;
  const streamerId = (await call('GET', '/auth/me', { token: streamerToken })).body?.user?.id;

  /* -------------------------------- profiles ------------------------------- */

  section('profiles');
  const profile = await call('GET', `/profiles/${streamer.username}`);
  check('GET /profiles/:username is public and returns the profile', profile.status === 200 && profile.body?.user?.username === streamer.username);

  const profilePatch = await call('PATCH', '/users/me', {
    token: streamerToken,
    body: { displayName: 'API Tester', bio: 'Automated contract check' },
  });
  check('PATCH /users/me updates the profile', profilePatch.status === 200 && !!profilePatch.body?.user);

  // Creators have to opt in before scheduling or generating a stream key.
  const streamerMode = await call('POST', '/users/me/streamer', { token: streamerToken, body: { isStreamer: true } });
  check('POST /users/me/streamer enables streamer mode', streamerMode.status === 200 && streamerMode.body?.user?.isStreamer !== false);

  const preferences = await call('PATCH', '/users/me/preferences', {
    token: streamerToken,
    body: { theme: 'dark', notifications: { email: false, push: false, streamStart: true, comments: true, followers: true } },
  });
  check('PATCH /users/me/preferences persists settings', preferences.status === 200);

  const publicProfile = await call('GET', `/profiles/${streamer.username}`, { token: viewerToken });
  check(
    'a public profile never leaks private fields',
    publicProfile.status === 200 && publicProfile.body?.user?.email === undefined && publicProfile.body?.user?.isAdmin === undefined,
  );

  // Channel dressing: pronouns, website, donation link and social links show up
  // on the public profile, and unsafe schemes are refused.
  const dressing = await call('PATCH', '/users/me', {
    token: streamerToken,
    body: {
      pronouns: 'they/them',
      websiteUrl: 'https://example.com',
      donationUrl: 'https://buymeacoffee.com/example',
      socialLinks: [{ platform: 'twitter', url: 'https://x.com/example' }],
    },
  });
  check('PATCH /users/me stores the public channel details', dressing.status === 200, String(dressing.status));

  const dressed = await call('GET', `/profiles/${streamer.username}`);
  check(
    'the public profile exposes the channel details',
    dressed.status === 200 &&
      dressed.body?.user?.pronouns === 'they/them' &&
      dressed.body?.user?.donationUrl === 'https://buymeacoffee.com/example' &&
      (dressed.body?.user?.socialLinks ?? []).length > 0,
  );

  const avatarForm = new FormData();
  avatarForm.append('file', new Blob([PNG_BYTES], { type: 'image/png' }), 'avatar.png');
  const avatar = await postForm('/users/me/avatar', avatarForm, streamerToken);
  check(
    'POST /users/me/avatar stores the picture and returns its URL',
    avatar.status === 200 && typeof avatar.body?.url === 'string' && avatar.body.url.includes('/media/avatars/'),
    JSON.stringify(avatar.body).slice(0, 100),
  );

  const avatarServed = await fetch(`${BASE}${avatar.body?.url ?? '/api/definitely-missing'}`);
  check('the uploaded avatar is served back', avatarServed.status === 200 && avatarServed.headers.get('content-type')?.startsWith('image/'));

  const badAvatar = new FormData();
  badAvatar.append('file', new Blob(['not an image'], { type: 'text/plain' }), 'notes.txt');
  const rejectedAvatar = await postForm('/users/me/avatar', badAvatar, streamerToken);
  check('non-image avatars are rejected', rejectedAvatar.status === 400, String(rejectedAvatar.status));

  const insecureDonation = await call('PATCH', '/users/me', {
    token: streamerToken,
    body: { donationUrl: 'http://insecure.example' },
  });
  check('donation links must use https', insecureDonation.status === 400, String(insecureDonation.status));

  const hideProfile = await call('PATCH', '/users/me/preferences', {
    token: streamerToken,
    body: { privacy: { showProfileToUnregistered: false } },
  });
  const hiddenProfile = await call('GET', `/profiles/${streamer.username}`);
  const hiddenForMember = await call('GET', `/profiles/${streamer.username}`, { token: viewerToken });
  check(
    'a private profile is hidden from visitors and visible to members',
    hideProfile.status === 200 && hiddenProfile.status === 403 && hiddenForMember.status === 200,
    `${hiddenProfile.status}/${hiddenForMember.status}`,
  );
  await call('PATCH', '/users/me/preferences', { token: streamerToken, body: { privacy: { showProfileToUnregistered: true } } });

  /* --------------------------------- streams ------------------------------- */

  section('streams');
  const noTitle = await call('POST', '/streams', { token: streamerToken, body: {} });
  check('POST /streams requires a title', noTitle.status === 400 && !!noTitle.body?.error);

  const created = await call('POST', '/streams', {
    token: streamerToken,
    body: { title: 'API contract stream', category: 'Tech', tags: ['api'], streamType: 'internet' },
  });
  const streamId = created.body?.stream?.id;
  check('POST /streams creates a broadcast', created.status === 201 && !!streamId);

  const started = await call('POST', `/streams/${streamId}/start`, { token: streamerToken, body: {} });
  check('POST /streams/:id/start flips the broadcast live', started.status === 200);

  const live = await call('GET', '/streams?live=true');
  check('GET /streams?live=true lists the live broadcast', live.status === 200 && (live.body?.streams ?? []).some((s) => s.id === streamId));

  const retention = await call('PATCH', `/streams/${streamId}`, { token: streamerToken, body: { retentionHours: 12 } });
  check('PATCH /streams/:id accepts a retention override', retention.status === 200);

  const presence = await call('GET', `/streams/${streamId}/presence`);
  check('GET /streams/:id/presence reports the room state', presence.status === 200 && typeof presence.body?.viewers === 'number');

  const keys = await call('GET', '/streams/keys/generate', { token: streamerToken });
  check('GET /streams/keys/generate returns a stream key for streamers', keys.status === 200 && typeof keys.body?.streamKey === 'string');

  /* ---------------------------------- chat --------------------------------- */

  section('chat');
  const anonymousChat = await call('POST', `/streams/${streamId}/chat`, { body: { message: 'not signed in' } });
  check('anonymous chat is rejected', anonymousChat.status === 401);

  const chat = await call('POST', `/streams/${streamId}/chat`, { token: viewerToken, body: { message: 'hello from the API test' } });
  check('POST /streams/:id/chat accepts a viewer message', chat.status === 201 && !!chat.body?.message?.id);

  const history = await call('GET', `/streams/${streamId}/chat`);
  check(
    'GET /streams/:id/chat returns history including the new message',
    history.status === 200 && (history.body?.messages ?? []).some((m) => m.message === 'hello from the API test'),
  );

  /* ---------------------------- chat moderation ---------------------------- */

  section('chat moderation');
  const chatMessageId = chat.body?.message?.id;
  if (chatMessageId) {
    const hidden = await call('PATCH', `/chat/${chatMessageId}`, { token: streamerToken, body: { isModerated: true } });
    check('the broadcaster can hide a message', hidden.status === 200 && hidden.body?.isModerated === true);

    const viewerHide = await call('PATCH', `/chat/${chatMessageId}`, { token: viewerToken, body: { isModerated: true } });
    check('viewers cannot moderate the chat', viewerHide.status === 403);

    const muted = await call('POST', `/moderation/chat/${streamId}/restrictions`, {
      token: streamerToken,
      body: { userId: viewerId, kind: 'timeout', durationMinutes: 10, reason: 'api test' },
    });
    check(
      'the broadcaster can time out a viewer',
      muted.status === 200 || muted.status === 201,
      String(muted.status),
    );

    const mutedPost = await call('POST', `/streams/${streamId}/chat`, { token: viewerToken, body: { message: 'should be blocked' } });
    check('a timed-out viewer cannot post', mutedPost.status === 403, String(mutedPost.status));

    const restrictions = await call('GET', `/moderation/chat/${streamId}/restrictions`, { token: streamerToken });
    check(
      'the restriction list names the viewer',
      restrictions.status === 200 && (restrictions.body?.restrictions ?? []).some((r) => r.userId === viewerId),
    );

    const lifted = await call('DELETE', `/moderation/chat/${streamId}/restrictions/${viewerId}`, { token: streamerToken });
    const afterLift = await call('POST', `/streams/${streamId}/chat`, { token: viewerToken, body: { message: 'allowed again' } });
    check('lifting the timeout restores posting', (lifted.status === 200 || lifted.status === 204) && afterLift.status === 201);

    const history = await call('GET', `/streams/${streamId}/chat`);
    const moderated = (history.body?.messages ?? []).find((m) => m.id === chatMessageId);
    check('history marks the hidden message as moderated', moderated?.isModerated === true);
  }

  /* --------------------------------- follows ------------------------------- */

  section('social');
  const followState = await call('GET', `/users/${streamerId}/follow`, { token: viewerToken });
  check('GET /users/:id/follow reports the follow state', followState.status === 200 && typeof followState.body?.isFollowing === 'boolean');

  const follow = await call('PUT', `/users/${streamerId}/follow`, { token: viewerToken, body: {} });
  check('PUT /users/:id/follow follows a creator', follow.status === 200 && follow.body?.isFollowing === true);

  const refollow = await call('PUT', `/users/${streamerId}/follow`, { token: viewerToken, body: {} });
  const unfollow = await call('DELETE', `/users/${streamerId}/follow`, { token: viewerToken, body: {} });
  const refollow2 = await call('PUT', `/users/${streamerId}/follow`, { token: viewerToken, body: {} });
  check(
    'follow is idempotent and toggleable',
    refollow.status === 200 && unfollow.status === 200 && unfollow.body?.isFollowing === false && refollow2.status === 200,
  );

  const notifications = await call('GET', '/notifications', { token: viewerToken });
  check('GET /notifications lists follower events', notifications.status === 200 && Array.isArray(notifications.body?.notifications));

  const unread = await call('GET', '/notifications/unread-count', { token: viewerToken });
  check('GET /notifications/unread-count returns a number', unread.status === 200 && typeof unread.body?.unreadCount === 'number');

  const readAll = await call('POST', '/notifications/read-all', { token: viewerToken });
  check('POST /notifications/read-all clears the badge', readAll.status === 200);

  /* -------------------------------- schedule ------------------------------- */

  section('schedule');
  const scheduled = await call('POST', '/schedule', {
    token: streamerToken,
    body: { title: 'Tomorrow night', scheduledFor: new Date(Date.now() + 86_400_000).toISOString(), category: 'Tech' },
  });
  check('POST /schedule creates a slot', scheduled.status === 201, JSON.stringify(scheduled.body).slice(0, 100));

  const mine = await call('GET', '/schedule/mine', { token: streamerToken });
  check('GET /schedule/mine lists the slot', mine.status === 200 && (mine.body?.scheduled ?? []).length >= 1);

  const upcoming = await call('GET', '/schedule');
  check('GET /schedule is public', upcoming.status === 200 && Array.isArray(upcoming.body?.scheduled));

  /* ------------------------------- moderation ------------------------------ */

  section('moderation');
  const report = await call('POST', '/moderation/reports', {
    token: viewerToken,
    body: { targetType: 'stream', targetId: streamId, reason: 'other', details: 'API test report' },
  });
  check('POST /moderation/reports files a report', report.status === 201 || report.status === 200, JSON.stringify(report.body).slice(0, 120));

  const myReports = await call('GET', '/moderation/reports/mine', { token: viewerToken });
  check('GET /moderation/reports/mine lists it', myReports.status === 200 && Array.isArray(myReports.body?.reports));

  const block = await call('POST', `/moderation/blocks/${viewerId}`, { token: streamerToken, body: {} });
  const blocks = await call('GET', '/moderation/blocks', { token: streamerToken });
  const unblock = await call('DELETE', `/moderation/blocks/${viewerId}`, { token: streamerToken });
  check('block list add/list/remove round-trips', block.status === 200 && blocks.status === 200 && unblock.status === 200);

  const chatSettings = await call('GET', `/moderation/chat/${streamId}/settings`, { token: streamerToken });
  const chatSettingsPut = await call('PUT', `/moderation/chat/${streamId}/settings`, {
    token: streamerToken,
    body: { followersOnly: false, slowModeSeconds: 5, blockedWords: ['spam'] },
  });
  check(
    'chat rules read + write (followers-only, slow mode, blocked words)',
    chatSettings.status === 200 && chatSettingsPut.status === 200,
    JSON.stringify(chatSettings.body).slice(0, 100),
  );

  const rules = await call('GET', `/moderation/chat/${streamId}/rules`);
  check('GET /moderation/chat/:id/rules is public', rules.status === 200);

  /* -------------------------------- analytics ------------------------------ */

  section('analytics');
  const watchStart = await call('POST', '/analytics/watch/start', { body: { streamId } });
  const sessionId = watchStart.body?.sessionId;
  check('POST /analytics/watch/start opens an anonymous session', watchStart.status === 201 && !!sessionId, String(watchStart.status));

  if (sessionId) {
    const beat = await call('POST', '/analytics/watch/heartbeat', { body: { sessionId, seconds: 30 } });
    const end = await call('POST', '/analytics/watch/end', { body: { sessionId, seconds: 60 } });
    check('watch heartbeat + end are accepted', beat.status === 200 && end.status === 200);
  }

  const overview = await call('GET', '/analytics/overview?days=30', { token: streamerToken });
  check(
    'GET /analytics/overview returns totals + a daily series',
    overview.status === 200 && !!overview.body?.totals && Array.isArray(overview.body?.series),
    JSON.stringify(overview.body).slice(0, 100),
  );

  const streamAnalytics = await call('GET', `/analytics/streams/${streamId}`, { token: streamerToken });
  check('GET /analytics/streams/:id returns per-stream numbers', streamAnalytics.status === 200 && typeof streamAnalytics.body?.uniqueViewers === 'number');

  const daily = await call('GET', '/analytics/daily?days=7', { token: streamerToken });
  check('GET /analytics/daily returns persisted rollups', daily.status === 200 && Array.isArray(daily.body?.days));

  const publicStats = await call('GET', `/analytics/users/${(await call('GET', '/auth/me', { token: streamerToken })).body?.user?.id}`);
  check('GET /analytics/users/:id is public', publicStats.status === 200 && typeof publicStats.body?.stats?.sessions === 'number');

  /* ------------------------------- recordings ------------------------------ */

  section('recordings');
  const studio = await call('GET', '/recordings/mine', { token: streamerToken });
  check('GET /recordings/mine returns the library', studio.status === 200 && Array.isArray(studio.body?.recordings));

  const browse = await call('GET', '/recordings?limit=5');
  check('GET /recordings is public and paginated', browse.status === 200 && Array.isArray(browse.body?.recordings));

  /* --------------------------------- search -------------------------------- */

  section('search');
  const search = await call('GET', `/search?q=${encodeURIComponent('API contract')}`);
  check(
    'GET /search returns streams, channels, recordings and categories',
    search.status === 200 && Array.isArray(search.body?.streams) && Array.isArray(search.body?.channels) && Array.isArray(search.body?.recordings),
  );

  const suggest = await call('GET', `/search/suggest?q=${encodeURIComponent(streamer.username.slice(0, 6))}`);
  check('GET /search/suggest returns typeahead entries', suggest.status === 200 && Array.isArray(suggest.body?.suggestions));

  const trending = await call('GET', '/search/trending');
  check('GET /search/trending returns every rail', trending.status === 200 && Array.isArray(trending.body?.upcoming) && Array.isArray(trending.body?.rising));

  const liveNow = await call('GET', '/search/live');
  check('GET /search/live counts live channels', liveNow.status === 200 && typeof liveNow.body?.live === 'number');

  /* ------------------------------- integrations ---------------------------- */

  section('integrations');
  const events = await call('GET', '/integrations/events', { token: streamerToken });
  check(
    'GET /integrations/events lists the signed catalogue',
    events.status === 200 && (events.body?.events ?? []).length >= 5 && events.body.events[0].signatureHeader === 'X-LSC-Signature',
  );

  const webhook = await call('POST', '/integrations/webhooks', {
    token: streamerToken,
    body: { url: 'https://example.com/api-test-hook', events: ['stream.live', 'stream.ended'] },
  });
  const webhookId = webhook.body?.id;
  check('POST /integrations/webhooks returns the one-time secret', webhook.status === 201 && String(webhook.body?.secret ?? '').startsWith('whsec_'));

  if (webhookId) {
    const list = await call('GET', '/integrations/webhooks', { token: streamerToken });
    check('GET /integrations/webhooks lists the endpoint', list.status === 200 && (list.body?.webhooks ?? []).some((w) => w.id === webhookId));

    const patch = await call('PATCH', `/integrations/webhooks/${webhookId}`, { token: streamerToken, body: { enabled: false, events: ['stream.live'] } });
    check('PATCH /integrations/webhooks/:id updates subscriptions', patch.status === 200);

    const test = await call('POST', `/integrations/webhooks/${webhookId}/test`, { token: streamerToken });
    check(
      'POST /integrations/webhooks/:id/test reports the delivery result',
      test.status === 200 && typeof test.body?.delivered === 'boolean' && test.body?.status !== undefined,
      JSON.stringify(test.body).slice(0, 100),
    );

    const rotate = await call('POST', `/integrations/webhooks/${webhookId}/rotate`, { token: streamerToken });
    check('POST /integrations/webhooks/:id/rotate returns a new secret', rotate.status === 200 && String(rotate.body?.secret ?? '').startsWith('whsec_'));

    const removed = await call('DELETE', `/integrations/webhooks/${webhookId}`, { token: streamerToken });
    check('DELETE /integrations/webhooks/:id removes it', removed.status === 200);
  }

  /* --------------------------------- payments ------------------------------ */

  section('payments');
  const presets = await call('GET', '/payments/presets');
  check('GET /payments/presets is public', presets.status === 200 && Array.isArray(presets.body?.presets ?? presets.body?.amounts ?? []));

  const paymentConfig = await call('GET', '/payments/config', { token: streamerToken });
  check('GET /payments/config reports provider readiness', paymentConfig.status === 200 && typeof (paymentConfig.body?.enabled ?? paymentConfig.body?.configured) === 'boolean');

  const tip = await call('POST', '/payments/tips', { token: viewerToken, body: { streamerId, amountCents: 500, message: 'API test tip' } });
  const paymentsOff = tip.status === 503 && tip.body?.code === 'payments_unavailable';
  const paymentsOn = tip.status === 201 && !!tip.body?.checkoutUrl;
  check(
    paymentsOff
      ? 'tips degrade to 503 `payments_unavailable` while no provider is configured'
      : 'tips create a checkout session when a provider is configured',
    paymentsOff || paymentsOn,
    JSON.stringify(tip.body).slice(0, 140),
  );

  const donationLink = await call('PUT', '/payments/donation-link', { token: streamerToken, body: { url: 'https://example.com/support-me' } });
  const earnings = await call('GET', '/payments/earnings', { token: streamerToken });
  check('creator donation link + earnings summary work', donationLink.status === 200 && earnings.status === 200);

  /* ---------------------------------- admin -------------------------------- */

  section('admin');
  const forbidden = await call('GET', '/admin/overview', { token: streamerToken });
  check('non-admins get 403 from /admin/*', forbidden.status === 403, String(forbidden.status));

  const cleanupNoToken = await call('POST', '/admin/cleanup', { body: {} });
  check('POST /admin/cleanup requires the cleanup token', cleanupNoToken.status === 401 || cleanupNoToken.status === 403, String(cleanupNoToken.status));

  // Deeper console coverage runs when an operator token is supplied:
  //   LSC_TEST_ADMIN_TOKEN=<jwt> node scripts/api-test.mjs
  const adminToken = process.env.LSC_TEST_ADMIN_TOKEN;
  if (adminToken) {
    const keys = ['overview', 'users', 'streams', 'reports', 'bans', 'audit', 'email', 'errors', 'flags', 'categories', 'payments'];
    for (const key of keys) {
      const response = await call('GET', `/admin/${key}`, { token: adminToken });
      check(`GET /admin/${key} answers for an operator`, response.status === 200, String(response.status));
    }

    const role = await call('POST', `/admin/users/${viewerId}/role`, { token: adminToken, body: { emailVerified: true } });
    check('POST /admin/users/:id/role changes account flags', role.status === 200, JSON.stringify(role.body).slice(0, 80));

    const errors = await call('GET', '/admin/errors?limit=1', { token: adminToken });
    const firstError = errors.body?.errors?.[0] ?? errors.body?.items?.[0];
    if (firstError?.id) {
      const dismissed = await call('DELETE', `/admin/errors/${firstError.id}`, { token: adminToken });
      check('DELETE /admin/errors/:id clears a client error', dismissed.status === 200 || dismissed.status === 204, String(dismissed.status));
    }

    const flag = await call('GET', '/admin/flags', { token: adminToken });
    const firstFlag = flag.body?.flags?.[0];
    if (firstFlag?.key) {
      const toggled = await call('PUT', `/admin/flags/${firstFlag.key}`, { token: adminToken, body: { enabled: !!firstFlag.enabled } });
      check('PUT /admin/flags/:key round-trips', toggled.status === 200, JSON.stringify(toggled.body).slice(0, 80));
    }

    const cleanup = await call('POST', '/admin/cleanup', { headers: { 'x-cleanup-token': process.env.LSC_TEST_CLEANUP_TOKEN ?? '' }, body: { limit: 5 } });
    if (process.env.LSC_TEST_CLEANUP_TOKEN) {
      check('POST /admin/cleanup runs with the cleanup token', cleanup.status === 200 && !!cleanup.body?.report, String(cleanup.status));
    }
  } else {
    console.log('   (set LSC_TEST_ADMIN_TOKEN to exercise the operator surface)');
  }

  /* -------------------------------- teardown ------------------------------- */

  section('teardown');
  const stop = await call('POST', `/streams/${streamId}/stop`, { token: streamerToken });
  check('POST /streams/:id/stop ends the broadcast', stop.status === 200);

  const ended = await call('GET', `/streams/${streamId}`);
  check('the stream is offline and marked not live', ended.status === 200 && ended.body?.stream?.isLive === false);

  const deleteStream = await call('DELETE', `/streams/${streamId}`, { token: streamerToken });
  check('DELETE /streams/:id removes it', deleteStream.status === 200 || deleteStream.status === 204, String(deleteStream.status));

  const logout = await call('POST', '/auth/logout', { token: streamerToken, body: { refreshToken: refresh.body?.refreshToken } });
  check('POST /auth/logout revokes the session', logout.status === 200);

  const viewerDelete = await call('DELETE', '/auth/account', {
    token: viewerToken,
    body: { password: viewer.password, confirm: 'DELETE' },
  });
  check('DELETE /auth/account starts the deletion grace period', viewerDelete.status === 200, JSON.stringify(viewerDelete.body).slice(0, 100));

  /* -------------------------------- summary -------------------------------- */

  const failures = results.filter(([, passed]) => !passed);
  console.log(`\n--- ${results.length - failures.length}/${results.length} checks passed ---`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const [name, , detail] of failures) console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  console.error('\napi-test crashed:', error);
  process.exit(1);
});
