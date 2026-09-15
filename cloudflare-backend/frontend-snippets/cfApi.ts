// Drop-in REST client for the Cloudflare backend.
// Copy to: src/services/cfApi.ts
// Set VITE_CF_API_URL=https://live-stream-share-cast-api.<you>.workers.dev

const BASE = (import.meta as any).env?.VITE_CF_API_URL || "http://localhost:8787";

function token() { return localStorage.getItem("cf_jwt") || ""; }
export function setToken(t: string | null) {
  if (t) localStorage.setItem("cf_jwt", t);
  else localStorage.removeItem("cf_jwt");
}

async function req(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `Request failed: ${res.status}`);
  return data;
}

export const cfApi = {
  signup: (username: string, email: string, password: string) =>
    req("/api/auth/signup", { method: "POST", body: JSON.stringify({ username, email, password }) }),
  login: (email: string, password: string) =>
    req("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => req("/api/auth/me"),
  listStreams: (live = true, limit = 50) => req(`/api/streams?live=${live}&limit=${limit}`),
  getStream: (id: string) => req(`/api/streams/${id}`),
  createStream: (b: any) => req("/api/streams", { method: "POST", body: JSON.stringify(b) }),
  startStream: (id: string, isRecording = false) =>
    req(`/api/streams/${id}/start`, { method: "POST", body: JSON.stringify({ isRecording }) }),
  stopStream: (id: string) => req(`/api/streams/${id}/stop`, { method: "POST" }),
  updateViewers: (id: string, count: number) =>
    req(`/api/streams/${id}/viewers`, { method: "PATCH", body: JSON.stringify({ count }) }),
  getChat: (id: string, limit = 50) => req(`/api/streams/${id}/chat?limit=${limit}`),
  sendChat: (id: string, message: string, type = "text") =>
    req(`/api/streams/${id}/chat`, { method: "POST", body: JSON.stringify({ message, type }) }),
  chatWs: (id: string) => new WebSocket(`${BASE.replace(/^http/, "ws")}/api/streams/${id}/chat/ws`),
  signalWs: (id: string) => new WebSocket(`${BASE.replace(/^http/, "ws")}/api/signal/${id}`),
};

export async function uploadRecording(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BASE}/api/upload/recording`, {
    method: "POST",
    headers: token() ? { Authorization: `Bearer ${token()}` } : {},
    body: fd,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data;
}
