import type { AttentionRequest } from "./attentionInbox";
import type { MissionSummary } from "./missionTimeline";
import { resolveFleetSessionLabel } from "./sessionTitleSync";
import { buildSubagentTree } from "./subagentTree";
import { delegationIsActive } from "./subagentReducer";
import type { SubagentNode, SubagentProgress } from "./subagentTypes";
import type { ChatMessage, SessionRuntimeState, SessionSummary } from "./types";

export type FleetSessionStatus = "running" | "blocked" | "idle" | "completed";

export type FleetSessionCard = {
  sessionId: string;
  gatewayId: string | null;
  label: string;
  status: FleetSessionStatus;
  activity: string;
  isActive: boolean;
  isDelegating: boolean;
  attentionCount: number;
  missionSummary: MissionSummary | null;
  updatedAt: number;
  subagentTree: SubagentNode[];
  subagentCount: number;
  subagentActiveCount: number;
};

export type FleetSnapshot = {
  sessions: FleetSessionCard[];
  runningCount: number;
  blockedCount: number;
  completedCount: number;
};

export type FleetPromptTarget = {
  id: string;
  label: string;
  kind: "session" | "new";
};

export const FLEET_NEW_AGENT_TARGET = "__new__";

/** Completed cards fade from Fleet Mission Control after this window unless still saved in Sessions. */
export const FLEET_COMPLETED_TTL_MS = 30 * 60 * 1000;

export type BuildFleetSnapshotInput = {
  sessionRuntime: Record<string, SessionRuntimeState>;
  sessions: SessionSummary[];
  missionSummaries: Record<string, MissionSummary>;
  attentionRequests: AttentionRequest[];
  sessionKeyByGatewayId: Record<string, string>;
  gatewayIdBySessionKey: Record<string, string>;
  activeSessionId: string | null;
  activeDbSessionId: string | null;
  /** Session ids (gateway or db) currently delegating to subagents. */
  delegatingSessionIds?: ReadonlySet<string>;
  /** Per-session subagent progress keyed by gateway or db id. */
  subagentsBySessionId?: Record<string, SubagentProgress[]>;
  /** Gateway/db ids the user opened or prompted from this GUI. */
  guiTrackedSessionIds?: ReadonlySet<string>;
  /** Purpose titles derived from opening prompts. */
  sessionPurposeTitles?: Record<string, string>;
  /** Cached transcript snippets keyed by gateway or db session id. */
  sessionTranscriptsById?: Record<string, ChatMessage[]>;
};

type CanonicalSession = {
  sessionId: string;
  gatewayId: string | null;
  aliases: Set<string>;
};

const STATUS_SORT: Record<FleetSessionStatus, number> = {
  blocked: 0,
  running: 1,
  completed: 2,
  idle: 3,
};

function resolveCanonicalSession(
  target: string,
  sessionKeyByGatewayId: Record<string, string>,
  gatewayIdBySessionKey: Record<string, string>,
): CanonicalSession {
  const aliases = new Set<string>([target]);
  const dbFromGateway = sessionKeyByGatewayId[target];
  if (dbFromGateway) {
    aliases.add(dbFromGateway);
    return {
      sessionId: dbFromGateway,
      gatewayId: target,
      aliases,
    };
  }

  const gatewayFromDb = gatewayIdBySessionKey[target];
  if (gatewayFromDb) {
    aliases.add(gatewayFromDb);
    return {
      sessionId: target,
      gatewayId: gatewayFromDb,
      aliases,
    };
  }

  return {
    sessionId: target,
    gatewayId: null,
    aliases,
  };
}

function canonicalSessionsOverlap(
  a: CanonicalSession,
  b: CanonicalSession,
  sessionKeyByGatewayId: Record<string, string>,
  gatewayIdBySessionKey: Record<string, string>,
): boolean {
  for (const alias of a.aliases) {
    if (b.aliases.has(alias)) return true;
  }
  if (a.gatewayId && (b.sessionId === a.gatewayId || b.aliases.has(a.gatewayId))) return true;
  if (b.gatewayId && (a.sessionId === b.gatewayId || a.aliases.has(b.gatewayId))) return true;

  for (const alias of a.aliases) {
    const mappedDb = sessionKeyByGatewayId[alias];
    if (mappedDb && (b.sessionId === mappedDb || b.aliases.has(mappedDb))) return true;
    const mappedGateway = gatewayIdBySessionKey[alias];
    if (mappedGateway && (b.sessionId === mappedGateway || b.aliases.has(mappedGateway))) return true;
  }
  for (const alias of b.aliases) {
    const mappedDb = sessionKeyByGatewayId[alias];
    if (mappedDb && (a.sessionId === mappedDb || a.aliases.has(mappedDb))) return true;
    const mappedGateway = gatewayIdBySessionKey[alias];
    if (mappedGateway && (a.sessionId === mappedGateway || a.aliases.has(mappedGateway))) return true;
  }
  return false;
}

function preferCanonicalSessionId(a: CanonicalSession, b: CanonicalSession): string {
  const aIsDb = Boolean(a.gatewayId && a.sessionId !== a.gatewayId);
  const bIsDb = Boolean(b.gatewayId && b.sessionId !== b.gatewayId);
  if (aIsDb && !bIsDb) return a.sessionId;
  if (bIsDb && !aIsDb) return b.sessionId;
  if (a.sessionId.startsWith("session_") && !b.sessionId.startsWith("session_")) return a.sessionId;
  if (b.sessionId.startsWith("session_") && !a.sessionId.startsWith("session_")) return b.sessionId;
  return a.sessionId.length >= b.sessionId.length ? a.sessionId : b.sessionId;
}

function findExistingCanonicalKey(
  merged: Map<string, CanonicalSession>,
  next: CanonicalSession,
  sessionKeyByGatewayId: Record<string, string>,
  gatewayIdBySessionKey: Record<string, string>,
): string | null {
  if (merged.has(next.sessionId)) return next.sessionId;
  for (const [key, existing] of merged.entries()) {
    if (canonicalSessionsOverlap(existing, next, sessionKeyByGatewayId, gatewayIdBySessionKey)) {
      return key;
    }
  }
  return null;
}

function mergeCanonical(
  merged: Map<string, CanonicalSession>,
  target: string,
  sessionKeyByGatewayId: Record<string, string>,
  gatewayIdBySessionKey: Record<string, string>,
) {
  const next = resolveCanonicalSession(target, sessionKeyByGatewayId, gatewayIdBySessionKey);
  const existingKey = findExistingCanonicalKey(
    merged,
    next,
    sessionKeyByGatewayId,
    gatewayIdBySessionKey,
  );
  if (existingKey == null) {
    merged.set(next.sessionId, next);
    return;
  }

  const existing = merged.get(existingKey)!;
  for (const alias of next.aliases) existing.aliases.add(alias);
  if (!existing.gatewayId && next.gatewayId) existing.gatewayId = next.gatewayId;

  const preferredId = preferCanonicalSessionId(existing, next);
  if (preferredId !== existingKey) {
    existing.sessionId = preferredId;
    merged.delete(existingKey);
    merged.set(preferredId, existing);
  }
}

export function resolveRuntimeForAliases(
  aliases: Set<string>,
  sessionRuntime: Record<string, SessionRuntimeState>,
): SessionRuntimeState | undefined {
  let newest: SessionRuntimeState | undefined;
  for (const alias of aliases) {
    const runtime = sessionRuntime[alias];
    if (!runtime) continue;
    if (!newest || runtime.updatedAt > newest.updatedAt) {
      newest = runtime;
    }
  }
  return newest;
}

function missionSummaryForAliases(
  aliases: Set<string>,
  missionSummaries: Record<string, MissionSummary>,
): MissionSummary | null {
  for (const alias of aliases) {
    const summary = missionSummaries[alias];
    if (summary) return summary;
  }
  return null;
}

function attentionCountForAliases(
  aliases: Set<string>,
  attentionRequests: AttentionRequest[],
): number {
  return attentionRequests.filter((request) => aliases.has(request.sessionId)).length;
}

function transcriptForAliases(
  aliases: Set<string>,
  transcriptsById: Record<string, ChatMessage[]> | undefined,
): ChatMessage[] {
  if (!transcriptsById) return [];
  for (const alias of aliases) {
    const transcript = transcriptsById[alias];
    if (transcript?.length) return transcript;
  }
  return [];
}

function cardStatus(
  attentionCount: number,
  runtime: SessionRuntimeState | undefined,
  missionSummary: MissionSummary | null,
): FleetSessionStatus {
  if (attentionCount > 0) return "blocked";
  if (runtime?.blocked) return "blocked";
  if (runtime?.running) return "running";
  if (missionSummary && missionSummary.status !== "running") return "completed";
  return "idle";
}

function isActiveSession(
  canonical: CanonicalSession,
  activeSessionId: string | null,
  activeDbSessionId: string | null,
): boolean {
  if (!activeSessionId && !activeDbSessionId) return false;
  return (
    canonical.aliases.has(activeSessionId ?? "") ||
    canonical.aliases.has(activeDbSessionId ?? "") ||
    canonical.sessionId === activeSessionId ||
    canonical.sessionId === activeDbSessionId
  );
}

function subagentsForCanonical(
  canonical: CanonicalSession,
  subagentsBySessionId: Record<string, SubagentProgress[]> | undefined,
): SubagentProgress[] {
  if (!subagentsBySessionId) return [];
  for (const alias of canonical.aliases) {
    const items = subagentsBySessionId[alias];
    if (items?.length) return items;
  }
  const direct = subagentsBySessionId[canonical.sessionId];
  return direct ?? [];
}

function isDelegatingSession(
  canonical: CanonicalSession,
  delegatingSessionIds: ReadonlySet<string> | undefined,
  subagents: SubagentProgress[],
): boolean {
  if (subagents.length > 0 && delegationIsActive(subagents, false)) return true;
  if (!delegatingSessionIds || delegatingSessionIds.size === 0) return false;
  for (const alias of canonical.aliases) {
    if (delegatingSessionIds.has(alias)) return true;
  }
  return delegatingSessionIds.has(canonical.sessionId);
}

function aliasMatchesSet(aliases: Set<string>, ids: ReadonlySet<string>): boolean {
  for (const alias of aliases) {
    if (ids.has(alias)) return true;
  }
  return false;
}

function isSavedSession(
  canonical: CanonicalSession,
  savedSessionIds: ReadonlySet<string>,
): boolean {
  return aliasMatchesSet(canonical.aliases, savedSessionIds);
}

function isGuiTrackedSession(
  canonical: CanonicalSession,
  guiTrackedSessionIds: ReadonlySet<string> | undefined,
): boolean {
  if (!guiTrackedSessionIds || guiTrackedSessionIds.size === 0) return false;
  return aliasMatchesSet(canonical.aliases, guiTrackedSessionIds);
}

export function shouldShowFleetCard(options: {
  canonical: CanonicalSession;
  status: FleetSessionStatus;
  attentionCount: number;
  missionSummary: MissionSummary | null;
  isActive: boolean;
  savedSessionIds: ReadonlySet<string>;
  guiTrackedSessionIds?: ReadonlySet<string>;
  now?: number;
}): boolean {
  const {
    canonical,
    status,
    attentionCount,
    missionSummary,
    isActive,
    savedSessionIds,
    guiTrackedSessionIds,
    now = Date.now(),
  } = options;

  if (isActive) return true;
  if (attentionCount > 0 || status === "blocked") return true;
  if (status === "running") {
    return isGuiTrackedSession(canonical, guiTrackedSessionIds) || isSavedSession(canonical, savedSessionIds);
  }
  if (status === "completed" && missionSummary) {
    const recent = now - missionSummary.completedAt <= FLEET_COMPLETED_TTL_MS;
    return (
      recent &&
      (isGuiTrackedSession(canonical, guiTrackedSessionIds) || isSavedSession(canonical, savedSessionIds))
    );
  }
  return false;
}

export function buildFleetSnapshot(input: BuildFleetSnapshotInput): FleetSnapshot {
  const savedSessionIds = new Set(input.sessions.map((session) => session.id));
  const merged = new Map<string, CanonicalSession>();

  for (const session of input.sessions) {
    mergeCanonical(merged, session.id, input.sessionKeyByGatewayId, input.gatewayIdBySessionKey);
  }
  for (const request of input.attentionRequests) {
    mergeCanonical(merged, request.sessionId, input.sessionKeyByGatewayId, input.gatewayIdBySessionKey);
  }
  if (input.activeSessionId) {
    mergeCanonical(merged, input.activeSessionId, input.sessionKeyByGatewayId, input.gatewayIdBySessionKey);
  }
  if (input.activeDbSessionId) {
    mergeCanonical(merged, input.activeDbSessionId, input.sessionKeyByGatewayId, input.gatewayIdBySessionKey);
  }
  if (input.guiTrackedSessionIds) {
    for (const trackedId of input.guiTrackedSessionIds) {
      mergeCanonical(merged, trackedId, input.sessionKeyByGatewayId, input.gatewayIdBySessionKey);
    }
  }
  for (const [key, runtime] of Object.entries(input.sessionRuntime)) {
    if (!runtime.running && !runtime.blocked) continue;
    mergeCanonical(merged, key, input.sessionKeyByGatewayId, input.gatewayIdBySessionKey);
  }
  for (const [key, summary] of Object.entries(input.missionSummaries)) {
    if (summary.status === "running") {
      mergeCanonical(merged, key, input.sessionKeyByGatewayId, input.gatewayIdBySessionKey);
      continue;
    }
    const canonical = resolveCanonicalSession(key, input.sessionKeyByGatewayId, input.gatewayIdBySessionKey);
    if (
      Date.now() - summary.completedAt <= FLEET_COMPLETED_TTL_MS &&
      (isGuiTrackedSession(canonical, input.guiTrackedSessionIds) ||
        isSavedSession(canonical, savedSessionIds))
    ) {
      mergeCanonical(merged, key, input.sessionKeyByGatewayId, input.gatewayIdBySessionKey);
    }
  }

  const cards: FleetSessionCard[] = [];
  for (const canonical of merged.values()) {
    const runtime = resolveRuntimeForAliases(canonical.aliases, input.sessionRuntime);
    const missionSummary = missionSummaryForAliases(canonical.aliases, input.missionSummaries);
    const attentionCount = attentionCountForAliases(canonical.aliases, input.attentionRequests);
    const status = cardStatus(attentionCount, runtime, missionSummary);
    const activity =
      status === "completed" && missionSummary?.summaryText?.trim()
        ? missionSummary.summaryText.trim().slice(0, 160)
        : runtime?.activity?.trim() ||
          (status === "blocked" ? "Waiting for your input" : "") ||
          "Ready";

    if (
      !shouldShowFleetCard({
        canonical,
        status,
        attentionCount,
        missionSummary,
        isActive: isActiveSession(canonical, input.activeSessionId, input.activeDbSessionId),
        savedSessionIds,
        guiTrackedSessionIds: input.guiTrackedSessionIds,
      })
    ) {
      continue;
    }

    const sessionSubagents = subagentsForCanonical(canonical, input.subagentsBySessionId);
    const subagentTree = buildSubagentTree(sessionSubagents);
    const subagentActiveCount = subagentTree.reduce(
      (count, node) => count + node.aggregate.activeCount,
      0,
    );

    cards.push({
      sessionId: canonical.sessionId,
      gatewayId: canonical.gatewayId,
      label: resolveFleetSessionLabel(canonical.sessionId, {
        sessions: input.sessions,
        purposeTitles: input.sessionPurposeTitles,
        aliasIds: [...canonical.aliases],
        context: {
          transcript: transcriptForAliases(canonical.aliases, input.sessionTranscriptsById),
          subagents: sessionSubagents,
          missionSummary,
          runtimeActivity: runtime?.activity,
        },
      }),
      status,
      activity,
      isActive: isActiveSession(canonical, input.activeSessionId, input.activeDbSessionId),
      isDelegating: isDelegatingSession(canonical, input.delegatingSessionIds, sessionSubagents),
      attentionCount,
      missionSummary,
      updatedAt: runtime?.updatedAt ?? missionSummary?.completedAt ?? 0,
      subagentTree,
      subagentCount: sessionSubagents.length,
      subagentActiveCount,
    });
  }

  cards.sort((a, b) => {
    const statusDiff = STATUS_SORT[a.status] - STATUS_SORT[b.status];
    if (statusDiff !== 0) return statusDiff;
    return b.updatedAt - a.updatedAt;
  });

  return {
    sessions: cards,
    runningCount: cards.filter((card) => card.status === "running").length,
    blockedCount: cards.filter((card) => card.status === "blocked").length,
    completedCount: cards.filter((card) => card.status === "completed").length,
  };
}

export function fleetPromptTargetOptions(snapshot: FleetSnapshot): FleetPromptTarget[] {
  const seen = new Set<string>();
  const sessionTargets: FleetPromptTarget[] = [];

  for (const card of snapshot.sessions) {
    if (card.status !== "running" && card.status !== "blocked" && !card.isActive) continue;
    const targetId = card.gatewayId ?? card.sessionId;
    if (seen.has(targetId)) continue;
    seen.add(targetId);
    sessionTargets.push({
      id: targetId,
      label: card.isActive ? `${card.label} (active)` : card.label,
      kind: "session",
    });
  }

  if (sessionTargets.length === 0 && snapshot.sessions.length > 0) {
    const active = snapshot.sessions.find((card) => card.isActive) ?? snapshot.sessions[0];
    const targetId = active.gatewayId ?? active.sessionId;
    sessionTargets.push({
      id: targetId,
      label: active.label,
      kind: "session",
    });
  }

  return [
    ...sessionTargets,
    { id: FLEET_NEW_AGENT_TARGET, label: "New agent…", kind: "new" },
  ];
}

export function fleetTargetGatewayId(
  targetId: string,
  sessionKeyByGatewayId: Record<string, string>,
  gatewayIdBySessionKey: Record<string, string>,
): string {
  if (sessionKeyByGatewayId[targetId]) return targetId;
  return gatewayIdBySessionKey[targetId] ?? targetId;
}

export function resolveLiveGatewayForTarget(
  target: string,
  live: Array<{ gateway_id: string; session_key?: string }>,
  sessionKeyByGatewayId: Record<string, string>,
  gatewayIdBySessionKey: Record<string, string>,
): string | null {
  if (!target) return null;
  for (const session of live) {
    if (session.gateway_id === target || session.session_key === target) {
      return session.gateway_id;
    }
  }

  const mappedGateway = gatewayIdBySessionKey[target];
  if (mappedGateway && live.some((session) => session.gateway_id === mappedGateway)) {
    return mappedGateway;
  }

  if (live.some((session) => session.gateway_id === target)) {
    return target;
  }

  const dbFromGateway = sessionKeyByGatewayId[target];
  if (dbFromGateway) {
    const gatewayFromDb = gatewayIdBySessionKey[dbFromGateway];
    if (gatewayFromDb && live.some((session) => session.gateway_id === gatewayFromDb)) {
      return gatewayFromDb;
    }
  }

  return null;
}

export function fleetFocusTargetId(card: Pick<FleetSessionCard, "gatewayId" | "sessionId">): string {
  return card.gatewayId ?? card.sessionId;
}

export function summarizeFleetCard(card: FleetSessionCard): string {
  if (card.missionSummary?.summaryText?.trim()) {
    return card.missionSummary.summaryText.trim();
  }
  return card.activity.trim() || `${card.label} is ${card.status}.`;
}
