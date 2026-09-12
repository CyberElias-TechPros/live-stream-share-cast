import { useCallback, useEffect, useState } from "react";

/**
 * Signature-hue theming. The whole visual identity is driven by CSS custom
 * properties that swap when <html data-accent="..."> changes.
 */

export const ACCENTS = [
  {
    id: "magenta",
    label: "Magenta",
    swatch: "linear-gradient(120deg, hsl(258 88% 58%), hsl(322 92% 60%))",
    desc: "Violet → magenta. The original.",
  },
  {
    id: "aurora",
    label: "Aurora",
    swatch: "linear-gradient(120deg, hsl(190 95% 46%), hsl(262 90% 62%))",
    desc: "Cyan → violet. Cooler, nocturnal.",
  },
  {
    id: "ember",
    label: "Ember",
    swatch: "linear-gradient(120deg, hsl(32 98% 54%), hsl(348 85% 58%))",
    desc: "Amber → rose. Warm, after-hours.",
  },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"];

const KEY = "imlive:accent";
const EVENT = "imlive:accent";

export function getAccent(): AccentId {
  if (typeof document === "undefined") return "magenta";
  const stored = document.documentElement.dataset.accent;
  if (stored === "aurora" || stored === "ember" || stored === "magenta") return stored;
  return "magenta";
}

export function applyAccent(id: AccentId) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.accent = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id }));
}

/** Apply the persisted accent before first paint (call in main.tsx). */
export function bootAccent() {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "aurora" || stored === "ember" || stored === "magenta") {
      document.documentElement.dataset.accent = stored;
    }
  } catch {
    /* ignore */
  }
}

/** Re-render consumers when the accent changes. */
export function useAccent() {
  const [accent, setAccentState] = useState<AccentId>(getAccent);

  useEffect(() => {
    const onChange = (e: Event) => {
      setAccent((e as CustomEvent<AccentId>).detail);
    };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  // applyAccent dispatches the event; the listener above syncs state.
  const setAccent = useCallback((id: AccentId) => {
    applyAccent(id);
  }, []);

  return [accent, setAccent] as const;
}

/**
 * Read a raw theme token (an "H S L" triple) as a ready-to-use CSS color.
 * Re-reads on accent change, so recharts & friends can follow the theme.
 */
export function useAccentColor(token: "--accent-mid" | "--accent-hi" | "--stream-h" | "--signal-h"): string {
  const [accent] = useAccent();
  const [color, setColor] = useState(() => {
    if (typeof window === "undefined") return "hsl(285 95% 68%)";
    const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    return v ? `hsl(${v})` : "hsl(285 95% 68%)";
  });

  useEffect(() => {
    // read on the next frame so the <html> attribute has updated
    const raf = requestAnimationFrame(() => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
      if (v) setColor(`hsl(${v})`);
    });
    return () => cancelAnimationFrame(raf);
  }, [accent, token]);

  return color;
}
