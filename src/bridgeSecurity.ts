import { Platform } from "react-native";

export const DEFAULT_BRIDGE_WS = "ws://127.0.0.1:8766/ws";

const TOKEN_STORAGE_KEY = "hermes-native-gui-bridge-token";

/** Only permit loopback bridge endpoints to reduce credential exfiltration risk. */
export function isAllowedBridgeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") return false;
    const host = parsed.hostname.toLowerCase();
    if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") return false;
    return parsed.pathname === "/ws" || parsed.pathname.endsWith("/ws");
  } catch {
    return false;
  }
}

export function normalizeBridgeUrl(url: string): string {
  const trimmed = url.trim();
  if (!isAllowedBridgeUrl(trimmed)) {
    throw new Error("Bridge URL must use ws://127.0.0.1 or ws://localhost and path /ws");
  }
  return trimmed;
}

export function storeBridgeToken(token: string): void {
  if (Platform.OS !== "web" || typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function getStoredBridgeToken(): string | null {
  if (Platform.OS !== "web" || typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(TOKEN_STORAGE_KEY);
}

export function clearStoredBridgeToken(): void {
  if (Platform.OS !== "web" || typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
}

function readBridgeTokenFromUrl(): string | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("bridgeToken");
  if (!fromUrl) return null;

  storeBridgeToken(fromUrl);
  params.delete("bridgeToken");
  const query = params.toString();
  const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  window.history.replaceState({}, "", next);
  return fromUrl;
}

/** @deprecated Use resolveBridgeToken — kept for callers that only need URL/storage. */
export function captureBridgeTokenFromUrl(): string | null {
  return readBridgeTokenFromUrl() ?? getStoredBridgeToken();
}

function bridgeHttpOrigin(wsUrl: string): string {
  const parsed = new URL(wsUrl);
  const host = parsed.hostname === "localhost" ? "127.0.0.1" : parsed.hostname;
  const port = parsed.port || "8766";
  return `http://${host}:${port}`;
}

export type LiveGatewaySession = {
  gateway_id: string;
  session_key: string;
  running: boolean;
  activity?: string;
};

export type SessionSnapshot = {
  gateway_id: string;
  session_key: string;
  running: boolean;
  activity: string;
  messages: Array<{ role: string; text?: string; name?: string; context?: string }>;
  active_tools: Array<{ tool_id: string; name: string; context?: string }>;
};

/** Ask the bridge which Hermes gateway sessions are still alive server-side. */
export async function fetchLiveGatewaySessions(
  wsUrl: string = DEFAULT_BRIDGE_WS,
): Promise<LiveGatewaySession[]> {
  try {
    const response = await fetch(`${bridgeHttpOrigin(wsUrl)}/live-sessions`, { cache: "no-store" });
    if (!response.ok) return [];
    const data = (await response.json()) as { sessions?: LiveGatewaySession[] };
    if (!Array.isArray(data.sessions)) return [];
    return data.sessions
      .map((row) => ({
        gateway_id: String(row.gateway_id ?? ""),
        session_key: String(row.session_key ?? ""),
        running: Boolean(row.running),
        activity: typeof row.activity === "string" ? row.activity : "",
      }))
      .filter((row) => row.gateway_id);
  } catch {
    return [];
  }
}

/** In-memory gateway snapshot — includes in-flight turns missing from DB history. */
export async function fetchSessionSnapshot(
  wsUrl: string,
  gatewayId: string,
): Promise<SessionSnapshot | null> {
  if (!gatewayId) return null;
  try {
    const response = await fetch(
      `${bridgeHttpOrigin(wsUrl)}/session-snapshot/${encodeURIComponent(gatewayId)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return null;
    return (await response.json()) as SessionSnapshot;
  } catch {
    return null;
  }
}

async function fetchBridgeConfig(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as { token?: string };
    return data.token ? String(data.token) : null;
  } catch {
    return null;
  }
}

function readDevBridgeTokenFromEnv(): string | null {
  const env = (globalThis as Record<string, unknown>).process as
    | { env?: Record<string, string | undefined> }
    | undefined;
  return env?.env?.EXPO_PUBLIC_HERMES_BRIDGE_TOKEN?.trim() || null;
}

/** Resolve the bridge token from URL, live bridge config, env, or storage. */
export async function resolveBridgeToken(wsUrl: string = DEFAULT_BRIDGE_WS): Promise<string | null> {
  const fromUrl = readBridgeTokenFromUrl();
  if (fromUrl) return fromUrl;

  // Prefer the bridge's current token over stale sessionStorage (bridge restarts in dev).
  const fromBridge = await fetchBridgeConfig(`${bridgeHttpOrigin(wsUrl)}/bridge-config`);
  if (fromBridge) {
    storeBridgeToken(fromBridge);
    return fromBridge;
  }

  const fromEnv = readDevBridgeTokenFromEnv();
  if (fromEnv) {
    storeBridgeToken(fromEnv);
    return fromEnv;
  }

  const stored = getStoredBridgeToken();
  if (stored) return stored;

  const sameOriginToken = await fetchBridgeConfig("/bridge-config.json");
  if (sameOriginToken) {
    storeBridgeToken(sameOriginToken);
    return sameOriginToken;
  }

  return null;
}

export function buildAuthenticatedWsUrl(baseUrl: string, token: string): string {
  const parsed = new URL(normalizeBridgeUrl(baseUrl));
  parsed.searchParams.set("token", token);
  return parsed.toString();
}
