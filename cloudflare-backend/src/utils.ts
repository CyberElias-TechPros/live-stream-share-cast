export interface Env {
  DB: D1Database;
  RECORDINGS: R2Bucket;
  THUMBNAILS: R2Bucket;
  CHAT_ROOM: DurableObjectNamespace;
  SIGNAL_ROOM: DurableObjectNamespace;
  JWT_SECRET: string;
  ENVIRONMENT?: string;
  RECORDINGS_PUBLIC_BASE?: string;
  THUMBNAILS_PUBLIC_BASE?: string;
  R2_PUBLIC_BASE?: string; // legacy fallback
  ALLOWED_ORIGINS?: string;
}

export const corsHeaders = (req: Request, env: Env) => {
  const allowed = (env.ALLOWED_ORIGINS || "*")
    .split(",")
    .map((s) => s.trim());
  const origin = req.headers.get("Origin") || "*";
  const allowOrigin =
    allowed.includes("*") || allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
};

export const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...(headers as any) },
  });

export const uid = (prefix = "id") =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

export const nowIso = () => new Date().toISOString();

export const toBool = (v: any) => v === 1 || v === true;

export function parseJson<T>(v: any, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "object") return v as T;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}
