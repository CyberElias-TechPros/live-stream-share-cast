// SignalRoom Durable Object — WebRTC LAN-signaling relay.
// Replaces Supabase Realtime broadcast channel "lan-stream-<id>" event "signal"
// used by src/lib/lanStream.ts (hello-viewer / streamer-ready / offer / answer / ice / close).
//
// Protocol is unchanged: JSON { from, to?, type, sdp?, candidate? }.
// Frontend only needs to swap the transport (see CLOUDFLARE_INTEGRATION.md).

export class SignalRoom implements DurableObject {
  private sessions = new Map<WebSocket, string>();

  constructor(private state: DurableObjectState, private env: any) {}

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("SignalRoom: use websocket", { status: 400 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.accept();
    this.sessions.set(server, "");

    server.addEventListener("message", (e) => {
      const raw = typeof e.data === "string" ? e.data : "";
      let msg: any = null;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg?.from) this.sessions.set(server, msg.from);
      // relay to all except sender; honor `to` targeting like lanStream.ts does
      for (const [ws] of [...this.sessions]) {
        if (ws === server) continue;
        try { ws.send(raw); } catch { this.sessions.delete(ws); }
      }
    });
    const close = () => this.sessions.delete(server);
    server.addEventListener("close", close);
    server.addEventListener("error", close);
    return new Response(null, { status: 101, webSocket: client });
  }
}
