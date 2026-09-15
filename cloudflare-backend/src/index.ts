import type { Env } from "./utils";
import { corsHeaders, json } from "./utils";
import { handleAuth } from "./routes/auth";
import { handleProfiles } from "./routes/profiles";
import { handleStreams } from "./routes/streams";
import { handleUpload, handleAdmin, cleanupExpiredRecordings } from "./routes/upload";

export { ChatRoom } from "./do/ChatRoom";
export { SignalRoom } from "./do/SignalRoom";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const cors = corsHeaders(req, env);

    if (req.method === "OPTIONS") return new Response(null, { headers: cors });

    try {
      // WS upgrades — must bypass D1 handlers
      let m = url.pathname.match(/^\/api\/streams\/([^/]+)\/chat\/ws$/);
      if (m && req.headers.get("Upgrade") === "websocket") {
        const stub = env.CHAT_ROOM.get(env.CHAT_ROOM.idFromName(decodeURIComponent(m[1])));
        return stub.fetch(req);
      }
      m = url.pathname.match(/^\/api\/signal\/([^/]+)$/);
      if (m && req.headers.get("Upgrade") === "websocket") {
        const stub = env.SIGNAL_ROOM.get(env.SIGNAL_ROOM.idFromName(decodeURIComponent(m[1])));
        return stub.fetch(req);
      }

      const handlers = [handleAuth, handleProfiles, handleStreams, handleUpload, handleAdmin];
      for (const h of handlers) {
        const res = await h(req, env, url);
        if (res) {
          const headers = new Headers(res.headers);
          Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
          return new Response(res.body, { status: res.status, headers });
        }
      }

      if (url.pathname === "/" || url.pathname === "/api") {
        return json(
          {
            name: "live-stream-share-cast-api",
            docs: [
              "POST /api/auth/signup | POST /api/auth/login | GET /api/auth/me",
              "GET/PATCH /api/profiles/:id | GET /api/profiles/by-username/:u",
              "PATCH /api/users/:id/streamer | PATCH /api/users/:id/preferences",
              "GET /api/users/:id/streams | GET /api/users/:id/sessions",
              "GET /api/users/:id/followers|following | POST/DELETE /api/follow",
              "GET /api/streams?live&limit | POST /api/streams | GET/PATCH /api/streams/:id",
              "POST /api/streams/:id/start|stop | PATCH /api/streams/:id/viewers|recording",
              "GET /api/streams/:id/stats | GET/POST /api/streams/:id/chat",
              "WS /api/streams/:id/chat/ws | WS /api/signal/:streamId",
              "POST /api/upload/recording|thumbnail | POST /api/admin/cleanup-recordings",
            ],
          },
          200,
          cors
        );
      }

      return json({ error: "Not found" }, 404, cors);
    } catch (e: any) {
      console.error("worker error:", e);
      return json({ error: e?.message || "Internal error" }, 500, cors);
    }
  },

  // Hourly cron -> cleanup-recordings (Supabase fn replacement)
  async scheduled(_event: ScheduledEvent, env: Env) {
    try {
      await cleanupExpiredRecordings(env);
    } catch (e) {
      console.error("cron cleanup failed:", e);
    }
  },
};
