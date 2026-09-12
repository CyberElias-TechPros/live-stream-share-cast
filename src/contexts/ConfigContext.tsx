import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AppConfig } from "@/types";

/**
 * App-wide runtime configuration from GET /api/config, fetched once.
 *
 * `mode` is "lan" when the app is served on a private/loopback host — the
 * whole product (accounts, streams, chat, calls) then runs against a server
 * on the local network with no internet ICE, and the UI surfaces LAN affordances
 * (badge, share-your-address panel with QR).
 */
const ConfigContext = createContext<AppConfig | null>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery({
    queryKey: ["config"],
    queryFn: () => api.get<AppConfig>("/api/config"),
    staleTime: 10 * 60 * 1000,
  });
  return <ConfigContext.Provider value={data ?? null}>{children}</ConfigContext.Provider>;
}

/** Runtime config, or null before the first fetch resolves. */
export function useConfig(): AppConfig | null {
  return useContext(ConfigContext);
}

/** True when the app is being served on a local network / loopback origin. */
export function useIsLan(): boolean {
  return useContext(ConfigContext)?.mode === "lan";
}
