import type { Env } from "../utils";
import { json, nowIso } from "../utils";
import { getAuthUserId } from "../auth";
import { mapProfile, mapStream } from "../mappers";

export async function handleProfiles(req: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;

  // GET /api/profiles/by-username/:username
  let m = path.match(/^\/api\/profiles\/by-username\/([^/]+)$/);
  if (m && req.method === "GET") {
    const row = await env.DB.prepare("SELECT * FROM profiles WHERE username = ?").bind(decodeURIComponent(m[1])).first<any>();
    if (!row) return json({ error: "Not found" }, 404);
    return json({ profile: mapProfile(row) });
  }

  // GET /api/profiles/:id  |  PATCH /api/profiles/:id
  m = path.match(/^\/api\/profiles\/([^/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (req.method === "GET") {
      const row = await env.DB.prepare("SELECT * FROM profiles WHERE id = ?").bind(id).first<any>();
      if (!row) return json({ error: "Not found" }, 404);
      return json({ profile: mapProfile(row) });
    }
    if (req.method === "PATCH") {
      const me = await getAuthUserId(req, env.JWT_SECRET);
      if (!me || me !== id) return json({ error: "Forbidden" }, 403);
      const b = (await req.json()) as any;
      const cols: string[] = [];
      const vals: any[] = [];
      const map: Record<string, string> = {
        username: "username", displayName: "display_name", bio: "bio", avatar: "avatar_url",
        isStreamer: "is_streamer", socialLinks: "social_links", preferences: "preferences",
      };
      for (const [k, col] of Object.entries(map)) {
        if (b[k] !== undefined) {
          cols.push(`${col} = ?`);
          vals.push(typeof b[k] === "object" ? JSON.stringify(b[k]) : b[k] === true ? 1 : b[k] === false ? 0 : b[k]);
        }
      }
      cols.push("updated_at = ?");
      vals.push(nowIso());
      vals.push(id);
      await env.DB.prepare(`UPDATE profiles SET ${cols.join(", ")} WHERE id = ?`).bind(...vals).run();
      const row = await env.DB.prepare("SELECT * FROM profiles WHERE id = ?").bind(id).first<any>();
      return json({ profile: mapProfile(row) });
    }
  }

  // PATCH /api/users/:id/streamer { isStreamer }
  m = path.match(/^\/api\/users\/([^/]+)\/streamer$/);
  if (m && req.method === "PATCH") {
    const id = decodeURIComponent(m[1]);
    const me = await getAuthUserId(req, env.JWT_SECRET);
    if (!me || me !== id) return json({ error: "Forbidden" }, 403);
    const { isStreamer } = (await req.json()) as any;
    await env.DB.prepare("UPDATE profiles SET is_streamer = ?, updated_at = ? WHERE id = ?").bind(isStreamer ? 1 : 0, nowIso(), id).run();
    return json({ ok: true, isStreamer: !!isStreamer });
  }

  // PATCH /api/users/:id/preferences
  m = path.match(/^\/api\/users\/([^/]+)\/preferences$/);
  if (m && req.method === "PATCH") {
    const id = decodeURIComponent(m[1]);
    const me = await getAuthUserId(req, env.JWT_SECRET);
    if (!me || me !== id) return json({ error: "Forbidden" }, 403);
    const patch = (await req.json()) as any;
    const cur = await env.DB.prepare("SELECT preferences FROM profiles WHERE id = ?").bind(id).first<any>();
    let prefs: any = {};
    try { prefs = cur?.preferences ? JSON.parse(cur.preferences) : {}; } catch { prefs = {}; }
    const merged = { ...prefs, ...patch };
    await env.DB.prepare("UPDATE profiles SET preferences = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(merged), nowIso(), id).run();
    return json({ ok: true, preferences: merged });
  }

  // GET /api/users/:id/streams
  m = path.match(/^\/api\/users\/([^/]+)\/streams$/);
  if (m && req.method === "GET") {
    const id = decodeURIComponent(m[1]);
    const { results } = await env.DB.prepare("SELECT * FROM streams WHERE user_id = ? ORDER BY created_at DESC").bind(id).all<any>();
    const prof = await env.DB.prepare("SELECT * FROM profiles WHERE id = ?").bind(id).first<any>();
    return json({ streams: (results || []).map((r) => mapStream(r, prof)) });
  }

  // GET /api/users/:id/sessions
  m = path.match(/^\/api\/users\/([^/]+)\/sessions$/);
  if (m && req.method === "GET") {
    const id = decodeURIComponent(m[1]);
    const { results } = await env.DB.prepare("SELECT * FROM stream_sessions WHERE user_id = ? ORDER BY created_at DESC").bind(id).all<any>();
    return json({
      sessions: (results || []).map((s) => ({
        id: s.id, streamId: s.stream_id, userId: s.user_id, startedAt: s.started_at,
        endedAt: s.ended_at, viewerCount: s.viewer_count, duration: s.duration,
        recordingUrl: s.recording_url, recordingExpiry: s.recording_expiry,
        peakViewers: s.peak_viewers, avgViewDuration: s.avg_view_duration,
        streamType: (s.stream_type || "internet") as "local" | "internet",
      })),
    });
  }

  // followers
  m = path.match(/^\/api\/users\/([^/]+)\/(followers|following)$/);
  if (m && req.method === "GET") {
    const id = decodeURIComponent(m[1]);
    const kind = m[2];
    const col = kind === "followers" ? "following_id" : "follower_id";
    const joinCol = kind === "followers" ? "follower_id" : "following_id";
    const { results } = await env.DB.prepare(
      `SELECT p.* FROM followers f JOIN profiles p ON p.id = f.${joinCol} WHERE f.${col} = ?`
    ).bind(id).all<any>();
    return json({ users: (results || []).map(mapProfile) });
  }

  if (path === "/api/follow" && (req.method === "POST" || req.method === "DELETE")) {
    const me = await getAuthUserId(req, env.JWT_SECRET);
    if (!me) return json({ error: "Unauthorized" }, 401);
    const { followerId, followingId } = (await req.json()) as any;
    const fid = followerId || me;
    if (fid !== me) return json({ error: "Forbidden" }, 403);
    if (req.method === "POST") {
      await env.DB.prepare("INSERT OR IGNORE INTO followers (id, follower_id, following_id) VALUES (?, ?, ?)")
        .bind(`f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, fid, followingId).run();
      await env.DB.prepare("UPDATE profiles SET followers_count = followers_count + 1 WHERE id = ?").bind(followingId).run();
      await env.DB.prepare("UPDATE profiles SET following_count = following_count + 1 WHERE id = ?").bind(fid).run();
      return json({ ok: true });
    } else {
      await env.DB.prepare("DELETE FROM followers WHERE follower_id = ? AND following_id = ?").bind(fid, followingId).run();
      return json({ ok: true });
    }
  }

  // GET /api/follow/check?followerId=&followingId=
  if (path === "/api/follow/check" && req.method === "GET") {
    const fid = url.searchParams.get("followerId");
    const tid = url.searchParams.get("followingId");
    if (!fid || !tid) return json({ following: false });
    const row = await env.DB.prepare("SELECT id FROM followers WHERE follower_id = ? AND following_id = ?").bind(fid, tid).first();
    return json({ following: !!row });
  }

  return null;
}
