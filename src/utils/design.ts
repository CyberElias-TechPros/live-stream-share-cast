/**
 * Design-system helpers: deterministic per-stream "scenes" so every
 * card/hero gets its own bespoke color story instead of one flat purple.
 */

const SCENES = [
  { from: "258 88% 58%", via: "288 80% 46%", to: "322 85% 40%", accent: "hsl(var(--accent-mid))" },
  { from: "226 89% 58%", via: "258 80% 48%", to: "290 70% 38%", accent: "hsl(240 90% 70%)" },
  { from: "190 90% 45%", via: "226 85% 50%", to: "262 80% 42%", accent: "hsl(190 90% 60%)" },
  { from: "322 85% 55%", via: "348 80% 48%", to: "25 85% 45%", accent: "hsl(330 90% 68%)" },
  { from: "282 75% 55%", via: "320 70% 45%", to: "252 60% 35%", accent: "hsl(300 85% 70%)" },
  { from: "160 80% 40%", via: "190 75% 45%", to: "230 80% 45%", accent: "hsl(170 80% 55%)" },
] as const;

export type Scene = (typeof SCENES)[number];

/** Deterministic string hash (djb2) */
export function hashSeed(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return Math.abs(hash);
}

export function sceneFor(seed: string): Scene {
  return SCENES[hashSeed(seed || "stream") % SCENES.length];
}

/** CSS background for a stream "scene" (thumbnails, cards, player backdrops) */
export function sceneBackground(seed: string): string {
  const s = sceneFor(seed);
  return `linear-gradient(135deg, hsl(${s.from}) 0%, hsl(${s.via}) 52%, hsl(${s.to}) 100%)`;
}

/** Subtle radial vignette layered over a scene for depth */
export const SCENE_VIGNETTE =
  "radial-gradient(120% 90% at 20% 10%, hsl(250 60% 95% / 0.14) 0%, transparent 45%), radial-gradient(140% 120% at 85% 100%, hsl(252 60% 3% / 0.75) 0%, transparent 60%)";

export function formatViewers(n?: number): string {
  const v = n ?? 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(v);
}

export function initials(name?: string): string {
  if (!name) return "•";
  return name
    .split(/[\s_.-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
