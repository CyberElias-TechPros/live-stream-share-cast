import type { Env } from "../utils";
import { json, uid, nowIso } from "../utils";
import { getAuthUserId, hashPassword, signJwt, newUserId } from "../auth";
import { mapProfile } from "../mappers";

const DEFAULT_PREFS = {
  theme: "system",
  notifications: { email: true, push: true, streamStart: true, comments: true, followers: true },
  privacy: { showOnlineStatus: true, allowMessages: true, showProfileToUnregistered: true },
  streaming: { defaultStreamType: "internet", defaultQuality: "720p", autoRecord: false, autoDeleteRecordings: true, recordingRetentionHours: 6 },
};

export async function handleAuth(req: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;

  // POST /api/auth/signup { username, email, password }
  if (path === "/api/auth/signup" && req.method === "POST") {
    const { username, email, password } = (await req.json()) as any;
    if (!username || !email || !password) return json({ error: "username, email, password required" }, 400);
    const exists = await env.DB.prepare("SELECT id FROM profiles WHERE username = ? OR email = ?").bind(username, email).first();
    if (exists) return json({ error: "Username or email already taken" }, 409);
    const id = newUserId();
    const pw = await hashPassword(password, id);
    await env.DB.prepare("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)").bind(id, email, pw).run();
    await env.DB.prepare(
      "INSERT INTO profiles (id, username, email, display_name, preferences, social_links) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(id, username, email, username, JSON.stringify(DEFAULT_PREFS), JSON.stringify([])).run();
    const token = await signJwt({ sub: id, email }, env.JWT_SECRET, 7 * 24 * 3600);
    return json({ token, user: { id, username, email } }, 201);
  }

  // POST /api/auth/login { email, password }
  if (path === "/api/auth/login" && req.method === "POST") {
    const { email, password } = (await req.json()) as any;
    const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<any>();
    if (!user) return json({ error: "Invalid credentials" }, 401);
    const pw = await hashPassword(password, user.id);
    if (pw !== user.password_hash) return json({ error: "Invalid credentials" }, 401);
    const profile = await env.DB.prepare("SELECT * FROM profiles WHERE id = ?").bind(user.id).first<any>();
    const token = await signJwt({ sub: user.id, email }, env.JWT_SECRET, 7 * 24 * 3600);
    await env.DB.prepare("UPDATE profiles SET last_seen = ? WHERE id = ?").bind(nowIso(), user.id).run();
    return json({ token, user: profile ? mapProfile(profile) : { id: user.id, email } });
  }

  // GET /api/auth/me
  if (path === "/api/auth/me" && req.method === "GET") {
    const userId = await getAuthUserId(req, env.JWT_SECRET);
    if (!userId) return json({ error: "Unauthorized" }, 401);
    const profile = await env.DB.prepare("SELECT * FROM profiles WHERE id = ?").bind(userId).first<any>();
    if (!profile) return json({ error: "Profile not found" }, 404);
    return json({ user: mapProfile(profile) });
  }

  return null;
}
