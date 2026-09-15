import type { Env } from "../utils";
import { json, uid, nowIso } from "../utils";
import { getAuthUserId, newStreamKey } from "../auth";
import { mapStream, mapChat } from "../mappers";

async function profileById(env: Env, id: string) {
  return env.DB.prepare("SELECT * FROM profiles WHERE id = ?").bind(id).first<any>();
}

export async function handleStreams(req: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;

  // GET /api/streams?live=true&featured&limit=5
  if (path === "/api/streams" && req.method === "GET") {
    const live = url.searchParams.get("live") !== "false";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const { results } = await env.DB.prepare(
      `SELECT * FROM streams ${live ? "WHERE is_live = 1" : ""} ORDER BY viewer_count DESC LIMIT ?`
    ).bind(limit).all<any>();
    const out: any[] = [];
    for (const r of results || []) out.push(mapStream(r, await profileById(env, r.user_id)));
    return json({ streams: out });
  }

  // POST /api/streams — replaces Supabase generate-stream-key + insert
  if (path === "/api/streams" && req.method === "POST") {
    const userId = await getAuthUserId(req, env.JWT_SECRET);
    if (!userId) return json({ error: "Unauthorized" }, 401);
    const prof = await profileById(env, userId);
    if (!prof) return json({ error: "Profile not found" }, 404);
    // is_streamer check matches generate-stream-key edge fn
    if (!prof.is_streamer) return json({ error: "User is not a streamer" }, 403);
    const b = (await req.json()) as any;
    const id = uid("stream");
    const streamKey = newStreamKey(userId);
    let recordingExpiry: string | null = null;
    if (b.isRecording) {
      const d = new Date();
      d.setHours(d.getHours() + 6);
      recordingExpiry = d.toISOString();
    }
    await env.DB.prepare(
      `INSERT INTO streams (id, title, description, stream_key, user_id, category, tags, stream_type, recording_expiry)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, b.title || "Untitled Stream", b.description || null, streamKey, userId,
      b.category || null, JSON.stringify(b.tags || []), b.streamType || "internet", recordingExpiry).run();
    const row = await env.DB.prepare("SELECT * FROM streams WHERE id = ?").bind(id).first<any>();
    return json({ stream: mapStream(row, prof) }, 201);
  }

  // GET /api/streams/:id
  let m = path.match(/^\/api\/streams\/([^/]+)$/);
  if (m && req.method === "GET") {
    const row = await env.DB.prepare("SELECT * FROM streams WHERE id = ?").bind(decodeURIComponent(m[1])).first<any>();
    if (!row) return json({ error: "Not found" }, 404);
    return json({ stream: mapStream(row, await profileById(env, row.user_id)) });
  }

  // PATCH /api/streams/:id
  if (m && req.method === "PATCH") {
    const id = decodeURIComponent(m[1]);
    const userId = await getAuthUserId(req, env.JWT_SECRET);
    if (!userId) return json({ error: "Unauthorized" }, 401);
    const b = (await req.json()) as any;
    const sets: string[] = [];
    const vals: any[] = [];
    if (b.title !== undefined) { sets.push("title = ?"); vals.push(b.title); }
    if (b.description !== undefined) { sets.push("description = ?"); vals.push(b.description); }
    if (b.category !== undefined) { sets.push("category = ?"); vals.push(b.category); }
    if (b.tags !== undefined) { sets.push("tags = ?"); vals.push(JSON.stringify(b.tags)); }
    if (b.thumbnail !== undefined) { sets.push("thumbnail_url = ?"); vals.push(b.thumbnail); }
    if (b.streamType !== undefined) { sets.push("stream_type = ?"); vals.push(b.streamType); }
    if (b.isRecording !== undefined) { sets.push("is_recording = ?"); vals.push(b.isRecording ? 1 : 0); }
    if (b.recordingUrl !== undefined) { sets.push("recording_url = ?"); vals.push(b.recordingUrl); }
    sets.push("updated_at = ?"); vals.push(nowIso()); vals.push(id);
    await env.DB.prepare(`UPDATE streams SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
    const row = await env.DB.prepare("SELECT * FROM streams WHERE id = ?").bind(id).first<any>();
    return json({ stream: mapStream(row, await profileById(env, row.user_id)) });
  }

  // POST /api/streams/:id/start  { isRecording }
  m = path.match(/^\/api\/streams\/([^/]+)\/start$/);
  if (m && req.method === "POST") {
    const id = decodeURIComponent(m[1]);
    const userId = await getAuthUserId(req, env.JWT_SECRET);
    if (!userId) return json({ error: "Unauthorized" }, 401);
    const { isRecording } = (await req.json().catch(() => ({}))) as any;
    let recordingExpiry: string | null = null;
    if (isRecording) {
      const d = new Date();
      d.setHours(d.getHours() + 6);
      recordingExpiry = d.toISOString();
    }
    await env.DB.prepare(
      "UPDATE streams SET is_live = 1, started_at = ?, ended_at = NULL, is_recording = ?, recording_expiry = ? WHERE id = ?"
    ).bind(nowIso(), isRecording ? 1 : 0, recordingExpiry, id).run();
    const s = await env.DB.prepare("SELECT * FROM streams WHERE id = ?").bind(id).first<any>();
    if (s) {
      await env.DB.prepare("INSERT INTO stream_sessions (id, stream_id, user_id, stream_type) VALUES (?, ?, ?, ?)")
        .bind(uid("sess"), id, s.user_id, s.stream_type || "internet").run();
    }
    return json({ ok: true });
  }

  // POST /api/streams/:id/stop
  m = path.match(/^\/api\/streams\/([^/]+)\/stop$/);
  if (m && req.method === "POST") {
    const id = decodeURIComponent(m[1]);
    const userId = await getAuthUserId(req, env.JWT_SECRET);
    if (!userId) return json({ error: "Unauthorized" }, 401);
    const now = nowIso();
    await env.DB.prepare("UPDATE streams SET is_live = 0, ended_at = ? WHERE id = ?").bind(now, id).run();
    const sess = await env.DB.prepare("SELECT * FROM stream_sessions WHERE stream_id = ? ORDER BY created_at DESC LIMIT 1").bind(id).first<any>();
    if (sess && !sess.ended_at) {
      const dur = Math.floor((Date.now() - new Date(sess.started_at).getTime()) / 1000);
      await env.DB.prepare("UPDATE stream_sessions SET ended_at = ?, duration = ? WHERE id = ?").bind(now, dur, sess.id).run();
    }
    return json({ ok: true });
  }

  // PATCH /api/streams/:id/viewers { count }
  m = path.match(/^\/api\/streams\/([^/]+)\/viewers$/);
  if (m && req.method === "PATCH") {
    const id = decodeURIComponent(m[1]);
    const { count, bandwidth, cpuUsage, memoryUsage } = (await req.json()) as any;
    await env.DB.prepare("UPDATE streams SET viewer_count = ?, peak_viewers = MAX(peak_viewers, ?) WHERE id = ?")
      .bind(count || 0, count || 0, id).run();
    await env.DB.prepare("INSERT INTO stream_stats (id, stream_id, viewer_count, bandwidth, cpu_usage, memory_usage) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(uid("stat"), id, count || 0, bandwidth || null, cpuUsage || null, memoryUsage || null).run();
    return json({ ok: true, viewerCount: count });
  }

  // PATCH /api/streams/:id/recording { recordingUrl, retentionHours }
  m = path.match(/^\/api\/streams\/([^/]+)\/recording$/);
  if (m && req.method === "PATCH") {
    const id = decodeURIComponent(m[1]);
    const { recordingUrl, retentionHours = 6 } = (await req.json()) as any;
    const d = new Date();
    d.setHours(d.getHours() + retentionHours);
    await env.DB.prepare("UPDATE streams SET recording_url = ?, recording_expiry = ? WHERE id = ?")
      .bind(recordingUrl, d.toISOString(), id).run();
    return json({ ok: true });
  }

  // GET /api/streams/:id/stats
  m = path.match(/^\/api\/streams\/([^/]+)\/stats$/);
  if (m && req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM stream_stats WHERE stream_id = ? ORDER BY timestamp ASC")
      .bind(decodeURIComponent(m[1])).all<any>();
    return json({
      stats: (results || []).map((s) => ({
        timestamp: s.timestamp, viewerCount: s.viewer_count, bandwidth: s.bandwidth,
        cpuUsage: s.cpu_usage, memoryUsage: s.memory_usage,
        errors: (() => { try { return s.errors ? JSON.parse(s.errors) : []; } catch { return []; } })(),
      })),
    });
  }

  // GET /api/streams/:id/chat?limit=50  |  POST /api/streams/:id/chat
  m = path.match(/^\/api\/streams\/([^/]+)\/chat$/);
  if (m) {
    const streamId = decodeURIComponent(m[1]);
    if (req.method === "GET") {
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
      const { results } = await env.DB.prepare(
        "SELECT * FROM chat_messages WHERE stream_id = ? AND is_moderated = 0 ORDER BY created_at DESC LIMIT ?"
      ).bind(streamId, limit).all<any>();
      const rows = (results || []).reverse();
      const out: any[] = [];
      for (const r of rows) out.push(mapChat(r, await profileById(env, r.user_id)));
      return json({ messages: out });
    }
    if (req.method === "POST") {
      const userId = await getAuthUserId(req, env.JWT_SECRET);
      if (!userId) return json({ error: "Unauthorized" }, 401);
      const { message, type = "text", metadata } = (await req.json()) as any;
      if (!message) return json({ error: "message required" }, 400);
      const id = uid("msg");
      await env.DB.prepare(
        "INSERT INTO chat_messages (id, stream_id, user_id, message, type, metadata) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(id, streamId, userId, message, type, metadata ? JSON.stringify(metadata) : null).run();
      const row = await env.DB.prepare("SELECT * FROM chat_messages WHERE id = ?").bind(id).first<any>();
      const chat = mapChat(row, await profileById(env, userId));
      // fan-out to ChatRoom DO (WebSocket subscribers)
      try {
        const stub = env.CHAT_ROOM.get(env.CHAT_ROOM.idFromName(streamId));
        await stub.fetch("https://do/broadcast", { method: "POST", body: JSON.stringify(chat) });
      } catch { /* non-fatal */ }
      return json({ message: chat }, 201);
    }
  }

  // PATCH /api/chat/:id/moderate { isModerated }
  m = path.match(/^\/api\/chat\/([^/]+)\/moderate$/);
  if (m && req.method === "PATCH") {
    const userId = await getAuthUserId(req, env.JWT_SECRET);
    if (!userId) return json({ error: "Unauthorized" }, 401);
    const { isModerated } = (await req.json()) as any;
    await env.DB.prepare("UPDATE chat_messages SET is_moderated = ? WHERE id = ?").bind(isModerated ? 1 : 0, decodeURIComponent(m[1])).run();
    return json({ ok: true });
  }

  return null;
}
