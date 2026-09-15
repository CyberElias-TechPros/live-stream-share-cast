// Replacement transport for src/lib/lanStream.ts openSignalChannel().
// Same JSON protocol { from, to?, type, sdp?, candidate? }, only the pipe changes:
// Supabase broadcast channel "lan-stream-<id>" -> Cloudflare SignalRoom WS.

export function openCfSignalChannel(
  streamId: string,
  base: string,
  onMessage: (msg: any) => void
): { send: (msg: any) => void; unsubscribe: () => void } {
  const ws = new WebSocket(`${base.replace(/^http/, "ws")}/api/signal/${streamId}`);
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg && typeof msg.type === "string") onMessage(msg);
    } catch { /* ignore */ }
  };
  const send = (msg: any) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    else ws.addEventListener("open", () => ws.send(JSON.stringify(msg)), { once: true });
  };
  return { send, unsubscribe: () => { try { ws.close(); } catch { /* ignore */ } } };
}
