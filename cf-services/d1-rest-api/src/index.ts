// Generic token-authenticated REST over one D1 database.
// Used for ke-town-db (ke-town-api) and slams (slams-api), which have full
// schemas but no workers. Safe defaults: every data route requires
// `Authorization: Bearer <ADMIN_TOKEN>`; table names are whitelisted from
// sqlite_master; column names are validated via PRAGMA table_info.

export interface Env {
  DB: D1Database;
  ADMIN_TOKEN: string;
  ALLOWED_ORIGINS?: string;
}

const SYS_TABLES = new Set(["_cf_KV", "sqlite_sequence", "d1_migrations"]);

const cors = (req: Request, env: Env) => {
  const allowed = (env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim());
  const origin = req.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": allowed.includes("*") || allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  };
};

const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...(headers as any) } });

const qid = (n: string) => `"${n.replace(/"/g, '""')}"`;

async function tables(env: Env): Promise<string[]> {
  const r = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all<{ name: string }>();
  return (r.results || []).map((x) => x.name).filter((n) => !SYS_TABLES.has(n) && !n.startsWith("sqlite_"));
}

async function columns(env: Env, table: string): Promise<{ name: string; pk: number }[]> {
  const r = await env.DB.prepare(`PRAGMA table_info(${qid(table)})`).all<any>();
  return (r.results || []).map((c) => ({ name: c.name, pk: c.pk }));
}

async function keyColumn(env: Env, table: string): Promise<string | null> {
  const cols = await columns(env, table);
  if (cols.some((c) => c.name === "id")) return "id";
  return null; // fall back to rowid
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const headers = cors(req, env);
    if (req.method === "OPTIONS") return new Response(null, { headers });

    if (url.pathname === "/api/health" && req.method === "GET") {
      return json({ ok: true, time: new Date().toISOString() }, 200, headers);
    }

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
    if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
      return json({ error: "Unauthorized" }, 401, headers);
    }

    try {
      const allowed = await tables(env);

      if (url.pathname === "/api/tables" && req.method === "GET") {
        return json({ tables: allowed }, 200, headers);
      }

      const m = url.pathname.match(/^\/api\/([A-Za-z0-9_]+)(?:\/([^/]+))?$/);
      if (!m) return json({ error: "Not found" }, 404, headers);
      const [, table, rowId] = m;
      if (!allowed.includes(table)) return json({ error: "Unknown table" }, 404, headers);

      const cols = await columns(env, table);
      const colNames = new Set(cols.map((c) => c.name));
      const key = await keyColumn(env, table);
      const keyExpr = key ? qid(key) : "rowid";

      if (req.method === "GET" && !rowId) {
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
        const offset = Math.max(parseInt(url.searchParams.get("offset") || "0"), 0);
        let orderBy = "";
        const order = url.searchParams.get("order"); // e.g. "id:desc"
        if (order) {
          const [col, dir] = order.split(":");
          if (colNames.has(col)) orderBy = `ORDER BY ${qid(col)} ${(dir || "asc").toLowerCase() === "desc" ? "DESC" : "ASC"}`;
        }
        const rows = await env.DB.prepare(`SELECT * FROM ${qid(table)} ${orderBy} LIMIT ? OFFSET ?`).bind(limit, offset).all();
        const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${qid(table)}`).first<{ n: number }>();
        return json({ rows: rows.results || [], total: total?.n || 0, limit, offset }, 200, headers);
      }

      if (req.method === "GET" && rowId) {
        const row = await env.DB.prepare(`SELECT * FROM ${qid(table)} WHERE ${keyExpr} = ?`).bind(decodeURIComponent(rowId)).first();
        if (!row) return json({ error: "Not found" }, 404, headers);
        return json({ row }, 200, headers);
      }

      if (req.method === "POST" && !rowId) {
        const body = (await req.json()) as Record<string, unknown>;
        const keys = Object.keys(body).filter((k) => colNames.has(k));
        if (!keys.length) return json({ error: "No valid columns in body" }, 400, headers);
        if (colNames.has("id") && body.id == null) {
          (body as any).id = `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
          keys.push("id");
        }
        const toDb = (v: unknown) => (typeof v === "object" && v !== null ? JSON.stringify(v) : (v as any));
        await env.DB.prepare(`INSERT INTO ${qid(table)} (${keys.map(qid).join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`)
          .bind(...keys.map((k) => toDb(body[k]))).run();
        return json({ ok: true, id: (body as any).id ?? null }, 201, headers);
      }

      if ((req.method === "PATCH" || req.method === "PUT") && rowId) {
        const body = (await req.json()) as Record<string, unknown>;
        const keys = Object.keys(body).filter((k) => colNames.has(k) && k !== key);
        if (!keys.length) return json({ error: "No valid columns in body" }, 400, headers);
        const vals = keys.map((k) => (typeof body[k] === "object" && body[k] !== null ? JSON.stringify(body[k]) : (body[k] as any)));
        await env.DB.prepare(`UPDATE ${qid(table)} SET ${keys.map((k) => `${qid(k)} = ?`).join(", ")} WHERE ${keyExpr} = ?`)
          .bind(...vals, decodeURIComponent(rowId)).run();
        return json({ ok: true }, 200, headers);
      }

      if (req.method === "DELETE" && rowId) {
        await env.DB.prepare(`DELETE FROM ${qid(table)} WHERE ${keyExpr} = ?`).bind(decodeURIComponent(rowId)).run();
        return json({ ok: true }, 200, headers);
      }

      return json({ error: "Not found" }, 404, headers);
    } catch (e: any) {
      return json({ error: e?.message || "Internal error" }, 500, headers);
    }
  },
};
