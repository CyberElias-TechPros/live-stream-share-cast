// Minimal HS256 JWT (Web Crypto) — replaces Supabase Auth for this app.
// Endpoints: signup / login / me. Passwords: SHA-256(password + salt).
// For production scale consider Cloudflare Access / WorkOS / Supabase Auth kept as-is.

import { nowIso, uid } from "./utils";

function b64urlEncode(data: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(secret: string, msg: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
}

export async function signJwt(payload: Record<string, any>, secret: string, expSec = 3600): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + expSec };
  const h = b64urlEncode(JSON.stringify(header));
  const p = b64urlEncode(JSON.stringify(body));
  const sig = b64urlEncode(await hmac(secret, `${h}.${p}`));
  return `${h}.${p}.${sig}`;
}

export async function verifyJwt(token: string, secret: string): Promise<Record<string, any> | null> {
  try {
    const [h, p, s] = token.split(".");
    if (!h || !p || !s) return null;
    const expect = b64urlEncode(await hmac(secret, `${h}.${p}`));
    if (expect !== s) return null;
    const body = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
    if (body.exp && body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${password}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getAuthUserId(req: Request, secret: string): Promise<string | null> {
  const h = req.headers.get("Authorization") || "";
  if (!h.startsWith("Bearer ")) return null;
  const payload = await verifyJwt(h.slice(7), secret);
  return (payload?.sub as string) || null;
}

export const newUserId = () => uid("user");
export const newStreamKey = (userId: string) =>
  `stream_${userId.split("_").pop()?.slice(0, 8) || "u"}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

export { nowIso };
