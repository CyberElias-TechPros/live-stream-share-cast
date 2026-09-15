import type { Env } from "../utils";
import { json, nowIso, uid } from "../utils";
import { getAuthUserId } from "../auth";

// POST /api/upload/recording (multipart form, field "file") -> R2
// POST /api/upload/thumbnail (multipart form, field "file")
export async function handleUpload(req: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname === "/api/upload/recording" && req.method === "POST") {
    const userId = await getAuthUserId(req, env.JWT_SECRET);
    if (!userId) return json({ error: "Unauthorized" }, 401);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json({ error: "No file provided" }, 400);
    const key = `${userId}/${Date.now()}_${file.name}`;
    await env.RECORDINGS.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || "video/webm" },
    });
    const base = env.R2_PUBLIC_BASE || "";
    return json({ success: true, url: base ? `${base}/${key}` : `r2://livestream-recordings/${key}`, fileName: file.name, size: file.size, type: file.type, key });
  }

  if (url.pathname === "/api/upload/thumbnail" && req.method === "POST") {
    const userId = await getAuthUserId(req, env.JWT_SECRET);
    if (!userId) return json({ error: "Unauthorized" }, 401);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json({ error: "No file provided" }, 400);
    const key = `${userId}/${Date.now()}_${file.name}`;
    await env.THUMBNAILS.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || "image/jpeg" },
    });
    const base = env.R2_PUBLIC_BASE || "";
    return json({ success: true, url: base ? `${base}/${key}` : `r2://livestream-thumbnails/${key}`, key });
  }

  return null;
}

// DELETE /api/admin/cleanup-recordings — also runs on cron.
// Replaces Supabase cleanup-recordings edge function.
export async function cleanupExpiredRecordings(env: Env) {
  const now = nowIso();
  const { results } = await env.DB.prepare(
    "SELECT id, recording_url FROM streams WHERE recording_expiry < ? AND recording_url IS NOT NULL"
  ).bind(now).all<any>();
  const out: any[] = [];
  for (const r of results || []) {
    try {
      const m = (r.recording_url as string).match(/livestream-recordings\/(.+)$/) || (r.recording_url as string).match(/\/([^/]+\/[^/]+)$/);
      if (m && r.recording_url.includes("r2://")) {
        await env.RECORDINGS.delete(decodeURIComponent(m[1]));
      } else if (m) {
        try { await env.RECORDINGS.delete(decodeURIComponent(m[1])); } catch { /* external URL — skip */ }
      }
      await env.DB.prepare("UPDATE streams SET recording_url = NULL, recording_expiry = NULL WHERE id = ?").bind(r.id).run();
      out.push({ id: r.id, success: true });
    } catch (e: any) {
      out.push({ id: r.id, success: false, error: e?.message });
    }
  }
  return { success: true, message: `Processed ${out.length} expired recordings`, results: out };
}

export async function handleAdmin(req: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname === "/api/admin/cleanup-recordings" && (req.method === "POST" || req.method === "DELETE")) {
    const result = await cleanupExpiredRecordings(env);
    return json(result);
  }
  if (url.pathname === "/api/health" && req.method === "GET") {
    return json({ ok: true, time: nowIso(), env: env.ENVIRONMENT || "unknown" });
  }
  return null;
}

export { uid };
