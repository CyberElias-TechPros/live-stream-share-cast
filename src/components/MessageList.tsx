import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/types";
import { cn } from "@/lib/utils";

/** Shared chat message list with autoscroll (used in Studio + Watch). */
export function MessageList({ messages, hostName }: { messages: ChatMessage[]; hostName?: string }) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3" aria-live="polite" aria-relevant="additions">
      {messages.length === 0 ? (
        <p className="pt-10 text-center text-sm text-text-faint">No messages yet.</p>
      ) : (
        messages.map((m) => (
          <p key={m.id} className="animate-slide-up break-words text-[13px] leading-snug">
            <span className={cn("font-semibold", m.username === hostName ? "text-live-hot" : "text-accent")}>{m.username}</span>
            <span className="text-text-muted"> {m.text}</span>
          </p>
        ))
      )}
    </div>
  );
}
