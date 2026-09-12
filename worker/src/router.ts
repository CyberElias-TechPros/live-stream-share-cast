import type { Env } from './env';

export interface Ctx {
  req: Request;
  env: Env;
  url: URL;
  params: Record<string, string>;
}

export type Handler = (ctx: Ctx) => Promise<Response> | Response;

interface Route {
  method: string;
  segments: string[];
  handler: Handler;
}

/** Minimal path router with `:param` segments — zero dependencies. */
export class Router {
  private readonly routes: Route[] = [];

  add(method: string, pattern: string, handler: Handler): this {
    this.routes.push({ method, segments: pattern.split('/').filter(Boolean), handler });
    return this;
  }

  get(pattern: string, handler: Handler) { return this.add('GET', pattern, handler); }
  post(pattern: string, handler: Handler) { return this.add('POST', pattern, handler); }
  patch(pattern: string, handler: Handler) { return this.add('PATCH', pattern, handler); }
  put(pattern: string, handler: Handler) { return this.add('PUT', pattern, handler); }
  delete(pattern: string, handler: Handler) { return this.add('DELETE', pattern, handler); }

  match(req: Request): { handler: Handler; params: Record<string, string> } | null {
    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const method = req.method.toUpperCase();
    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== pathSegments.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < route.segments.length; i++) {
        const patternSeg = route.segments[i]!;
        const pathSeg = decodeURIComponent(pathSegments[i]!);
        if (patternSeg.startsWith(':')) {
          params[patternSeg.slice(1)] = pathSeg;
        } else if (patternSeg !== pathSeg) {
          ok = false;
          break;
        }
      }
      if (ok) return { handler: route.handler, params };
    }
    return null;
  }

  /** True if any route matches the path regardless of method (for 405 vs 404). */
  knowsPath(pathname: string): boolean {
    const pathSegments = pathname.split('/').filter(Boolean);
    return this.routes.some((route) => {
      if (route.segments.length !== pathSegments.length) return false;
      return route.segments.every((seg, i) => seg.startsWith(':') || seg === pathSegments[i]);
    });
  }
}
