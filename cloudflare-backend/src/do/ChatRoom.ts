// ChatRoom Durable Object — realtime chat fan-out.
// Replaces Supabase Realtime postgres_changes on chat_messages.
// Clients: WS GET /api/streams/:id/chat/ws  (upgrade forwarded here)
// Broadcasts from POST handler via internal fetch to /broadcast.

export class ChatRoom implements DurableObject {
  private sessions = new Set<WebSocket>();

  constructor(private state: DurableObjectState, private env: any) {}

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/broadcast") {
      const msg = await req.text();
      for (const ws of [...this.sessions]) {
        try { ws.send(msg); } catch { this.sessions.delete(ws); }
      }
      return new Response("ok");
    }
    if (req.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      server.accept();
      this.sessions.add(server);
      server.addEventListener("close", () => this.sessions.delete(server));
      server.addEventListener("error", () => this.sessions.delete(server));
      // keep-alive + allow clients to send chat directly over WS (persisted by worker route instead)
      server.addEventListener("message", (e) => {
        // relay raw messages to others (presence/typing); persistence goes via REST
        for (const ws of [...this.sessions]) {
          if (ws !== server) { try { ws.send(e.data as string); } catch { /* ignore */ } }
        }
      });
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("ChatRoom: use websocket", { status: 400 });
  }
}
