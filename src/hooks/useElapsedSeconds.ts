import { useEffect, useState } from "react";

/** Live elapsed-seconds counter for running broadcasts. */
export function useElapsedSeconds(startedAtIso: string | null | undefined): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAtIso) {
      setElapsed(0);
      return;
    }
    const startMs = new Date(startedAtIso).getTime();
    if (Number.isNaN(startMs)) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [startedAtIso]);

  return elapsed;
}

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}
