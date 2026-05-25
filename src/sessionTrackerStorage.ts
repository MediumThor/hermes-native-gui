import { Platform } from "react-native";
import type { SessionRuntimeState } from "./types";

const STORAGE_KEY = "hermes-native-gui-session-tracker";

export type SessionTrackerSnapshot = {
  sessionRuntime: Record<string, SessionRuntimeState>;
  sessionKeyByGatewayId: Record<string, string>;
  gatewayIdBySessionKey: Record<string, string>;
  knownGatewayIds: string[];
  lastActiveDbSessionKey?: string;
  lastActiveGatewaySessionId?: string;
};

export function loadSessionTracker(): SessionTrackerSnapshot | null {
  if (Platform.OS !== "web" || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionTrackerSnapshot>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      sessionRuntime:
        parsed.sessionRuntime && typeof parsed.sessionRuntime === "object"
          ? parsed.sessionRuntime
          : {},
      sessionKeyByGatewayId:
        parsed.sessionKeyByGatewayId && typeof parsed.sessionKeyByGatewayId === "object"
          ? parsed.sessionKeyByGatewayId
          : {},
      gatewayIdBySessionKey:
        parsed.gatewayIdBySessionKey && typeof parsed.gatewayIdBySessionKey === "object"
          ? parsed.gatewayIdBySessionKey
          : {},
      knownGatewayIds: Array.isArray(parsed.knownGatewayIds)
        ? parsed.knownGatewayIds.map(String).filter(Boolean)
        : [],
      lastActiveDbSessionKey:
        typeof parsed.lastActiveDbSessionKey === "string" ? parsed.lastActiveDbSessionKey : undefined,
      lastActiveGatewaySessionId:
        typeof parsed.lastActiveGatewaySessionId === "string"
          ? parsed.lastActiveGatewaySessionId
          : undefined,
    };
  } catch {
    return null;
  }
}

export function saveSessionTracker(snapshot: SessionTrackerSnapshot) {
  if (Platform.OS !== "web" || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore quota / privacy errors.
  }
}
