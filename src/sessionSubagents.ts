import { applySubagentEvent } from "./subagentReducer";
import type { SubagentEventPayload, SubagentProgress } from "./subagentTypes";

export type SubagentsBySessionId = Record<string, SubagentProgress[]>;

export function resolveCanonicalSessionKey(
  sessionId: string,
  sessionKeyByGatewayId: Record<string, string>,
): string {
  return sessionKeyByGatewayId[sessionId] ?? sessionId;
}

export function subagentsForAliases(
  subagentsBySessionId: SubagentsBySessionId,
  aliases: Iterable<string>,
): SubagentProgress[] {
  for (const alias of aliases) {
    const items = subagentsBySessionId[alias];
    if (items?.length) return items;
  }
  return [];
}

export function applySubagentEventForSession(
  subagentsBySessionId: SubagentsBySessionId,
  sessionIds: string[],
  type: string,
  payload: SubagentEventPayload,
): SubagentsBySessionId {
  const keys = [...new Set(sessionIds.map((id) => id.trim()).filter(Boolean))];
  if (keys.length === 0) return subagentsBySessionId;

  const primaryKey = keys[0];
  const current = subagentsForAliases(subagentsBySessionId, keys);
  const nextItems = applySubagentEvent(current, type, payload);

  const updated: SubagentsBySessionId = { ...subagentsBySessionId };
  for (const key of keys) {
    updated[key] = nextItems;
  }
  return updated;
}

export function stashSubagentsForSession(
  subagentsBySessionId: SubagentsBySessionId,
  sessionIds: string[],
  items: SubagentProgress[],
): SubagentsBySessionId {
  const keys = [...new Set(sessionIds.map((id) => id.trim()).filter(Boolean))];
  if (keys.length === 0) return subagentsBySessionId;
  const updated = { ...subagentsBySessionId };
  for (const key of keys) {
    updated[key] = items;
  }
  return updated;
}
