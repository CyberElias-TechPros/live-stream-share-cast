/**
 * ICE server provisioning for WebRTC.
 *
 * The browser asks `GET /api/rtc/ice` for its `RTCConfiguration.iceServers`.
 * STUN is always included (harmless, no secret). TURN is added when configured:
 *
 *   • `cloudflare` — Cloudflare Calls TURN. Short-lived credentials are minted
 *     per request, so the API token never leaves the Worker.
 *   • `static`     — any RFC-5766 TURN server with fixed credentials.
 *
 * Without TURN, viewers behind symmetric NAT (most mobile networks) cannot
 * connect — roughly 10–20% of the audience — so this is the single most
 * important infrastructure key after `JWT_SECRET`.
 */

import type { Env } from '../env';
import { turnConfig } from './config';
import { log } from './logger';
import { fetchWithTimeout } from './http';

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceResponse {
  iceServers: IceServer[];
  ttlSeconds: number;
  turnConfigured: boolean;
  provider: string;
}

export async function iceServersFor(env: Env): Promise<IceResponse> {
  const config = turnConfig(env);
  const iceServers: IceServer[] = [];

  if (config.stunUrls.length) iceServers.push({ urls: config.stunUrls });

  if (config.provider === 'static' && config.staticUsername && config.staticPassword) {
    iceServers.push({ urls: config.turnUrls, username: config.staticUsername, credential: config.staticPassword });
  }

  if (config.provider === 'cloudflare' && config.keyId && config.apiToken) {
    try {
      const response = await fetchWithTimeout(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(config.keyId)}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.apiToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ ttl: config.ttlSeconds }),
        },
        5_000,
      );

      if (response.ok) {
        const payload = (await response.json()) as { iceServers?: IceServer | IceServer[] };
        const generated = payload.iceServers;
        if (Array.isArray(generated)) iceServers.push(...generated);
        else if (generated) iceServers.push(generated);
      } else {
        log.warn('cloudflare turn credential request failed', { status: response.status });
      }
    } catch (error) {
      log.warn('cloudflare turn unreachable', { error: String(error) });
    }
  }

  return {
    iceServers,
    ttlSeconds: config.ttlSeconds,
    turnConfigured: iceServers.some((server) => JSON.stringify(server.urls).includes('turn')),
    provider: config.provider,
  };
}

/**
 * Fallback configuration for clients that cannot reach `/api/rtc/ice`
 * (offline, API outage). Public STUN only — enough for LAN and open NAT.
 */
export function fallbackIceServers(env: Env): IceServer[] {
  return [{ urls: turnConfig(env).stunUrls }];
}
