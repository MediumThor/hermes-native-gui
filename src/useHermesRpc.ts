import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ApprovalChoice,
  ChatMessage,
  OverlayState,
  RpcFrame,
  SessionRuntimeState,
  SessionSummary,
  SlashCompletionResult,
  ToolActivity,
} from "./types";
import {
  loadSessionTracker,
  saveSessionTracker,
  type SessionTrackerSnapshot,
} from "./sessionTrackerStorage";
import {
  buildAuthenticatedWsUrl,
  clearStoredBridgeToken,
  DEFAULT_BRIDGE_WS,
  fetchLiveGatewaySessions,
  fetchSessionSnapshot,
  getStoredBridgeToken,
  normalizeBridgeUrl,
  resolveBridgeToken,
  type SessionSnapshot,
} from "./bridgeSecurity";
import {
  appendSystemTranscriptMessage,
  mergeLiveActivityMessages,
} from "./liveActivityTranscript";
import {
  appendSlashCommandTurn,
  coalesceAssistantReasoningTurns,
  enrichTranscriptWithReasoning,
  finalizeTranscriptHistory,
  loadCachedTranscript,
  mergeTranscriptMessages,
  pickRicherTranscript,
  reconcileTranscriptHistory,
  saveCachedTranscript,
  sortTranscriptChronologically,
} from "./chatTranscriptStorage";
import { summarizeUnknownRequest } from "./requestPayloadSanitizer";
import { isComposerBusy, isSessionBusyError } from "./promptDelivery";
import {
  applySubagentEvent,
  delegationIsActive,
} from "./subagentReducer";
import { buildSubagentTree } from "./subagentTree";
import type { SubagentEventPayload, SubagentProgress } from "./subagentTypes";
import { EMPTY_OVERLAY } from "./types";
import {
  attentionRequestFromEvent,
  removeAttentionRequest,
  upsertAttentionRequest,
  type AttentionRequest,
} from "./attentionInbox";
import { createMissionSummary, joinSubagentSummaries, type MissionSummary } from "./missionTimeline";
import { loadMissionSummaries, saveMissionSummaries, upsertMissionSummary } from "./missionSummaryStorage";
import {
  actionFromGatewayEvent,
  actionSummary,
  describeQueuedPrompt,
  isRenderableActivity,
  serializeAgentAction,
  type AgentAction,
} from "./agentActivity";
import { extractInlineDiff } from "./diffUtils";
import {
  aliasPurposeTitles,
  purposeTitleFromPrompt,
  resolveSessionPurposeTitle,
} from "./sessionPurposeTitles";
import {
  normalizeGatewaySessionTitle,
  shouldSyncSessionTitle,
} from "./sessionTitleSync";
import {
  applySubagentEventForSession,
  stashSubagentsForSession,
  subagentsForAliases,
  type SubagentsBySessionId,
} from "./sessionSubagents";
import {
  buildFleetSnapshot,
  fleetTargetGatewayId,
  FLEET_NEW_AGENT_TARGET,
  resolveRuntimeForAliases,
  resolveLiveGatewayForTarget,
  type FleetSnapshot,
} from "./fleetMission";

type UseHermesRpcOptions = {
  autoResumeOnConnect?: boolean;
};

type Pending = {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
};

function eventType(frame: RpcFrame): string | undefined {
  return frame.method === "event" ? frame.params?.type : undefined;
}

function payload(frame: RpcFrame): any {
  return frame.params?.payload ?? {};
}

function sessionIdFromFrame(frame: RpcFrame): string | undefined {
  return frame.params?.session_id;
}

function eventMatchesActiveSession(
  eventSessionId: string,
  activeSessionId: string | null,
  sessionKeyByGatewayId: Record<string, string>,
  gatewayIdBySessionKey: Record<string, string>,
): boolean {
  if (!eventSessionId || !activeSessionId) return !eventSessionId && !activeSessionId;
  if (eventSessionId === activeSessionId) return true;
  if (sessionKeyByGatewayId[eventSessionId] === activeSessionId) return true;
  if (gatewayIdBySessionKey[eventSessionId] === activeSessionId) return true;
  if (sessionKeyByGatewayId[activeSessionId] === eventSessionId) return true;
  if (gatewayIdBySessionKey[activeSessionId] === eventSessionId) return true;
  return false;
}

function resolveGatewaySessionId(
  target: string | null,
  sessionKeyByGatewayId: Record<string, string>,
  gatewayIdBySessionKey: Record<string, string>,
  knownGatewayIds: Set<string>,
): string | null {
  if (!target) return null;
  if (knownGatewayIds.has(target) || sessionKeyByGatewayId[target]) return target;
  const gatewayId = gatewayIdBySessionKey[target];
  return gatewayId ?? target;
}

function runtimeAliasesForSession(
  targetId: string,
  sessionKeyByGatewayId: Record<string, string>,
  gatewayIdBySessionKey: Record<string, string>,
): Set<string> {
  const aliases = new Set<string>([targetId]);
  const addAliasPair = (id: string) => {
    const dbKey = sessionKeyByGatewayId[id];
    if (dbKey) aliases.add(dbKey);
    const gatewayId = gatewayIdBySessionKey[id];
    if (gatewayId) aliases.add(gatewayId);
  };

  addAliasPair(targetId);
  for (const alias of [...aliases]) {
    addAliasPair(alias);
  }
  return aliases;
}

function parseSessionStatus(output: string) {
  const sessionKeyMatch = output.match(/^Session ID: (.+)$/m);
  const runningMatch = output.match(/^Agent Running: (Yes|No)$/m);
  return {
    sessionKey: sessionKeyMatch?.[1]?.trim() ?? "",
    running: runningMatch?.[1] === "Yes",
  };
}

export function mapHistoryMessages(restored: unknown[]): ChatMessage[] {
  const baseTime = Date.now() - restored.length * 1000;
  return restored.map((entry, index) => {
    const m = entry as Record<string, unknown>;
    const role = m.role;
    const reasoning = typeof m.reasoning === "string" && m.reasoning.trim() ? m.reasoning : undefined;
    const createdAt = Number(m.timestamp ?? m.created_at ?? m.createdAt ?? 0);
    return {
      id: String(m.id ?? `restored-${index}`),
      role: role === "assistant" || role === "user" ? role : "system",
      text: String(m.text ?? m.content ?? m.context ?? ""),
      reasoning,
      status: "complete" as const,
      createdAt: createdAt > 0 ? createdAt : baseTime + index * 1000,
    };
  });
}

export function appendLocalUserTurn(
  messages: ChatMessage[],
  text: string,
  options: { id?: string; now?: number } = {},
): { message: ChatMessage; messages: ChatMessage[] } {
  const now = options.now ?? Date.now();
  const message: ChatMessage = {
    id: options.id ?? `user-${now}`,
    role: "user",
    text,
    createdAt: now,
  };
  return { message, messages: [...messages, message] };
}

function transcriptHasPendingUserTurn(messages: ChatMessage[], text: string): boolean {
  const userIndex = [...messages]
    .map((message, index) => ({ message, index }))
    .reverse()
    .find(({ message }) => message.role === "user" && message.text === text)?.index;
  if (userIndex == null) return false;
  return !messages.slice(userIndex + 1).some((message) => message.role === "assistant");
}

function removeTranscriptMessage(messages: ChatMessage[], messageId: string): ChatMessage[] {
  return messages.filter((message) => message.id !== messageId);
}

function transcriptTurnLooksComplete(messages: ChatMessage[]): boolean {
  if (messages.some((message) => message.status === "streaming")) return false;
  const last = messages[messages.length - 1];
  return last?.role === "assistant" && last.status === "complete" && Boolean(last.text?.trim());
}

function snapshotIndicatesActiveWork(
  snapshot: SessionSnapshot,
  messages: ChatMessage[],
): boolean {
  if (!snapshot.running) return false;
  if (snapshot.active_tools.length > 0) return true;
  return !transcriptTurnLooksComplete(messages);
}

function finalizePolledTranscript(messages: ChatMessage[]): ChatMessage[] {
  return finalizeTranscriptHistory(
    messages.map((message) =>
      message.status === "streaming" && message.text?.trim()
        ? { ...message, status: "complete" as const }
        : message,
    ),
  );
}

function mapSnapshotTools(snapshot: SessionSnapshot): ToolActivity[] {
  return snapshot.active_tools.map((tool) => ({
    id: tool.tool_id,
    name: tool.name,
    status: "running" as const,
    preview: tool.context,
    startedAt: Date.now(),
    rawPayload: tool,
  }));
}

function findStreamingAssistantId(messages: ChatMessage[]): string | null {
  return messages.find((message) => message.role === "assistant" && message.status === "streaming")?.id ?? null;
}

/** Prefer the streaming assistant that still accepts live reasoning (nothing system-related after it). */
function findActiveReasoningTargetId(messages: ChatMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant" || message.status !== "streaming") continue;
    const hasSystemAfter = messages.slice(index + 1).some((entry) => entry.role === "system");
    if (!hasSystemAfter) return message.id;
  }
  return null;
}

function appendStreamingAssistantBubble(
  messages: ChatMessage[],
  idPrefix = "assistant",
): { messages: ChatMessage[]; id: string } {
  const existing = findStreamingAssistantId(messages);
  if (existing) return { messages, id: existing };
  const id = `${idPrefix}-${Date.now()}`;
  return {
    id,
    messages: [
      ...messages,
      {
        id,
        role: "assistant",
        text: "",
        status: "streaming",
        createdAt: Date.now(),
      },
    ],
  };
}

function persistSessionTranscript(
  gatewayId: string | null,
  dbKey: string | undefined,
  messages: ChatMessage[],
  memoryStore?: Record<string, ChatMessage[]>,
  sessionKeyByGatewayId: Record<string, string> = {},
  gatewayIdBySessionKey: Record<string, string> = {},
  options: { includeInProgress?: boolean } = {},
) {
  const snapshot = messages
    .filter((message) => options.includeInProgress || message.status !== "streaming")
    .map((message) => ({ ...message }));
  if (!gatewayId || snapshot.length === 0) return;

  const existing = recallSessionTranscript(
    gatewayId,
    dbKey,
    memoryStore ?? {},
    sessionKeyByGatewayId,
    gatewayIdBySessionKey,
  );
  const toSave = finalizeTranscriptHistory(
    pickRicherTranscript(
      enrichTranscriptWithReasoning(snapshot, existing),
      existing,
    ),
  );

  if (memoryStore) {
    memoryStore[gatewayId] = toSave;
    if (dbKey) memoryStore[dbKey] = toSave;
  }
  saveCachedTranscript(gatewayId, toSave);
  if (dbKey) saveCachedTranscript(dbKey, toSave);
}

function stashActiveSessionTranscript(
  gatewayId: string | null,
  dbKey: string | undefined,
  messages: ChatMessage[],
  memoryStore: Record<string, ChatMessage[]>,
  sessionKeyByGatewayId: Record<string, string> = {},
  gatewayIdBySessionKey: Record<string, string> = {},
) {
  if (!gatewayId || messages.length === 0) return;
  const snapshot = messages.map((message) => (
    message.status === "streaming"
      ? { ...message, status: "complete" as const }
      : message
  ));
  persistSessionTranscript(
    gatewayId,
    dbKey,
    snapshot,
    memoryStore,
    sessionKeyByGatewayId,
    gatewayIdBySessionKey,
  );
}

function recallSessionTranscript(
  gatewayId: string,
  dbKey: string | undefined,
  memoryStore: Record<string, ChatMessage[]>,
  sessionKeyByGatewayId: Record<string, string> = {},
  gatewayIdBySessionKey: Record<string, string> = {},
): ChatMessage[] {
  const keys = new Set<string>([gatewayId]);
  if (dbKey) keys.add(dbKey);
  const mappedDb = sessionKeyByGatewayId[gatewayId];
  if (mappedDb) keys.add(mappedDb);
  if (dbKey) {
    const mappedGateway = gatewayIdBySessionKey[dbKey];
    if (mappedGateway) keys.add(mappedGateway);
  }

  let best: ChatMessage[] = [];
  for (const key of keys) {
    if (!key) continue;
    best = pickRicherTranscript(best, memoryStore[key] ?? []);
    best = pickRicherTranscript(best, loadCachedTranscript(key));
  }
  return best;
}

function resolveStoredSessionKeys(
  target: string,
  sessionKeyByGatewayId: Record<string, string>,
  gatewayIdBySessionKey: Record<string, string>,
  knownGatewayIds: Set<string>,
): { gatewayId: string; dbKey?: string } {
  const gatewayId = resolveGatewaySessionId(
    target,
    sessionKeyByGatewayId,
    gatewayIdBySessionKey,
    knownGatewayIds,
  ) ?? target;
  const dbKey =
    sessionKeyByGatewayId[gatewayId] ??
    (gatewayIdBySessionKey[target] ? target : undefined) ??
    (knownGatewayIds.has(target) ? sessionKeyByGatewayId[target] : undefined);
  return { gatewayId, dbKey };
}

function isReasoningOnlyAssistant(message: ChatMessage): boolean {
  return message.role === "assistant" && !message.text?.trim();
}

function liveActivityAction(type: string, data: Record<string, unknown>): AgentAction | null {
  return actionFromGatewayEvent(type, data);
}

function liveActivityText(type: string, data: Record<string, unknown>): string {
  const action = liveActivityAction(type, data);
  return action ? actionSummary(action) : "";
}

function liveActivityMessageText(type: string, data: Record<string, unknown>): string {
  const action = liveActivityAction(type, data);
  return action ? serializeAgentAction(action) : "";
}

function appendReasoningSnippet(
  messages: ChatMessage[],
  snippet: string,
): { messages: ChatMessage[]; id: string } {
  if (!snippet) {
    const existing = findActiveReasoningTargetId(messages) ?? findStreamingAssistantId(messages);
    return { messages, id: existing ?? "" };
  }

  const streamingId = findActiveReasoningTargetId(messages);
  if (streamingId) {
    return {
      id: streamingId,
      messages: messages.map((message) =>
        message.id === streamingId
          ? { ...message, reasoning: `${message.reasoning ?? ""}${snippet}` }
          : message,
      ),
    };
  }

  const lastReasoningOnlyIndex = [...messages]
    .map((message, index) => ({ message, index }))
    .reverse()
    .find(({ message }) => isReasoningOnlyAssistant(message) && message.status === "streaming")?.index;

  if (lastReasoningOnlyIndex !== undefined) {
    const targetId = messages[lastReasoningOnlyIndex].id;
    return {
      id: targetId,
      messages: messages.map((message, index) =>
        index === lastReasoningOnlyIndex
          ? {
              ...message,
              reasoning: `${message.reasoning ?? ""}${snippet}`,
              status: "streaming" as const,
            }
          : message,
      ),
    };
  }

  const { messages: withBubble, id } = appendStreamingAssistantBubble(messages);
  return {
    id,
    messages: withBubble.map((message) =>
      message.id === id
        ? { ...message, reasoning: `${message.reasoning ?? ""}${snippet}` }
        : message,
    ),
  };
}

function applyReasoningDeltaToMessages(
  messages: ChatMessage[],
  snippet: string,
): ChatMessage[] {
  return appendReasoningSnippet(messages, snippet).messages;
}

function applyMessageCompleteToMessages(
  messages: ChatMessage[],
  text: string,
  reasoning: string,
  status: ChatMessage["status"],
): ChatMessage[] {
  const streamingId = findStreamingAssistantId(messages);
  if (streamingId) {
    return messages.map((message) =>
      message.id === streamingId
        ? {
            ...message,
            text: text || message.text,
            reasoning: reasoning || message.reasoning,
            status: status ?? "complete",
          }
        : message,
    );
  }

  const lastAssistantIndex = [...messages]
    .map((message, index) => ({ message, index }))
    .reverse()
    .find(({ message }) => message.role === "assistant")?.index;
  if (lastAssistantIndex === undefined) return messages;

  return messages.map((message, index) =>
    index === lastAssistantIndex
      ? {
          ...message,
          text: text || message.text,
          reasoning: reasoning || message.reasoning,
          status: status ?? "complete",
        }
      : message,
  );
}

function appendInProgressBubble(messages: ChatMessage[]): ChatMessage[] {
  return appendStreamingAssistantBubble(messages, "assistant-resume").messages;
}

function overlayPatchFromAttention(request: AttentionRequest): Partial<OverlayState> {
  switch (request.kind) {
    case "approval":
      return {
        approval: {
          command: request.command ?? request.preview,
          description: request.description,
          sessionId: request.sessionId,
          attentionId: request.id,
        },
      };
    case "clarify":
      return {
        clarify: {
          question: request.description,
          choices: request.choices ?? null,
          requestId: request.requestId ?? "",
          sessionId: request.sessionId,
          attentionId: request.id,
        },
      };
    case "sudo":
      return {
        sudo: {
          requestId: request.requestId ?? "",
          sessionId: request.sessionId,
          attentionId: request.id,
        },
      };
    case "secret":
      return {
        secret: {
          envVar: request.envVar ?? "",
          prompt: request.prompt ?? request.description,
          requestId: request.requestId ?? "",
          sessionId: request.sessionId,
          attentionId: request.id,
        },
      };
    default:
      return {};
  }
}

export function useHermesRpc(options: UseHermesRpcOptions = {}) {
  const initialTracker = useMemo(() => loadSessionTracker(), []);
  const [url, setUrlState] = useState(DEFAULT_BRIDGE_WS);
  const [bridgeToken, setBridgeToken] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tools, setTools] = useState<ToolActivity[]>([]);
  const [subagents, setSubagents] = useState<SubagentProgress[]>([]);
  const subagentsRef = useRef<SubagentProgress[]>([]);
  const [subagentsBySessionId, setSubagentsBySessionId] = useState<SubagentsBySessionId>({});
  const subagentsBySessionIdRef = useRef<SubagentsBySessionId>({});
  const [promptQueue, setPromptQueue] = useState<string[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const sessionsRef = useRef<SessionSummary[]>([]);
  const [sessionLastResponseAt, setSessionLastResponseAt] = useState<Record<string, number>>({});
  const [sessionRuntime, setSessionRuntime] = useState<Record<string, SessionRuntimeState>>(
    () => initialTracker?.sessionRuntime ?? {},
  );
  const [sessionKeyByGatewayId, setSessionKeyByGatewayId] = useState<Record<string, string>>(
    () => initialTracker?.sessionKeyByGatewayId ?? {},
  );
  const [gatewayIdBySessionKey, setGatewayIdBySessionKey] = useState<Record<string, string>>(
    () => initialTracker?.gatewayIdBySessionKey ?? {},
  );
  const [status, setStatus] = useState("Disconnected");
  const [busy, setBusy] = useState(false);
  const [overlay, setOverlay] = useState<OverlayState>(EMPTY_OVERLAY);
  const [attentionRequests, setAttentionRequests] = useState<AttentionRequest[]>([]);
  const attentionRequestsRef = useRef<AttentionRequest[]>([]);
  const [missionSummaries, setMissionSummaries] = useState<Record<string, MissionSummary>>(() => loadMissionSummaries());
  const wsRef = useRef<WebSocket | null>(null);
  const nextId = useRef(1);
  const pending = useRef<Map<number, Pending>>(new Map());
  const streamingMessageId = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const sessionTranscriptsRef = useRef<Record<string, ChatMessage[]>>({});
  const autoResumeOnConnectRef = useRef(options.autoResumeOnConnect ?? false);
  const sessionIdRef = useRef<string | null>(null);
  const knownGatewayIdsRef = useRef<Set<string>>(
    new Set(initialTracker?.knownGatewayIds ?? []),
  );
  const guiTrackedSessionIdsRef = useRef<Set<string>>(
    new Set(initialTracker?.guiTrackedSessionIds ?? []),
  );
  const [guiTrackedSessionIds, setGuiTrackedSessionIds] = useState<Set<string>>(
    () => new Set(initialTracker?.guiTrackedSessionIds ?? []),
  );
  const [sessionPurposeTitles, setSessionPurposeTitles] = useState<Record<string, string>>(
    () => initialTracker?.sessionPurposeTitles ?? {},
  );
  const lastActiveDbSessionKeyRef = useRef<string | undefined>(
    initialTracker?.lastActiveDbSessionKey,
  );
  const [trackedDbSessionId, setTrackedDbSessionId] = useState<string | null>(
    initialTracker?.lastActiveDbSessionKey ?? null,
  );
  const lastActiveGatewaySessionIdRef = useRef<string | undefined>(
    initialTracker?.lastActiveGatewaySessionId,
  );
  const refreshSessionsRef = useRef<() => Promise<void>>(async () => {});
  const sessionKeyByGatewayIdRef = useRef<Record<string, string>>({});
  const gatewayIdBySessionKeyRef = useRef<Record<string, string>>({});
  const promptQueueRef = useRef<string[]>([]);
  const drainingQueueRef = useRef(false);
  const titleSyncInFlightRef = useRef(new Set<string>());
  const titleSyncTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    promptQueueRef.current = promptQueue;
  }, [promptQueue]);

  useEffect(() => {
    attentionRequestsRef.current = attentionRequests;
  }, [attentionRequests]);

  const sessionRuntimeRef = useRef(sessionRuntime);
  useEffect(() => {
    sessionRuntimeRef.current = sessionRuntime;
  }, [sessionRuntime]);

  useEffect(() => {
    sessionKeyByGatewayIdRef.current = sessionKeyByGatewayId;
  }, [sessionKeyByGatewayId]);

  useEffect(() => {
    gatewayIdBySessionKeyRef.current = gatewayIdBySessionKey;
  }, [gatewayIdBySessionKey]);

  useEffect(() => {
    autoResumeOnConnectRef.current = options.autoResumeOnConnect ?? true;
  }, [options.autoResumeOnConnect]);

  useEffect(() => {
    guiTrackedSessionIdsRef.current = guiTrackedSessionIds;
  }, [guiTrackedSessionIds]);

  useEffect(() => {
    if (guiTrackedSessionIds.size > 0) return;
    const seed = [lastActiveGatewaySessionIdRef.current, lastActiveDbSessionKeyRef.current].filter(Boolean) as string[];
    if (seed.length === 0) return;
    setGuiTrackedSessionIds(new Set(seed));
  }, [guiTrackedSessionIds.size]);

  const persistSessionTracker = useCallback(() => {
    const snapshot: SessionTrackerSnapshot = {
      sessionRuntime,
      sessionKeyByGatewayId,
      gatewayIdBySessionKey,
      knownGatewayIds: [...knownGatewayIdsRef.current],
      guiTrackedSessionIds: [...guiTrackedSessionIdsRef.current],
      sessionPurposeTitles,
      lastActiveDbSessionKey: lastActiveDbSessionKeyRef.current,
      lastActiveGatewaySessionId: lastActiveGatewaySessionIdRef.current,
    };
    saveSessionTracker(snapshot);
  }, [gatewayIdBySessionKey, guiTrackedSessionIds, sessionKeyByGatewayId, sessionPurposeTitles, sessionRuntime]);

  const rememberSessionPurpose = useCallback((
    promptText: string,
    ids: Array<string | null | undefined>,
    options: { force?: boolean } = {},
  ) => {
    const title = purposeTitleFromPrompt(promptText);
    if (!title) return;
    setSessionPurposeTitles((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of ids) {
        const trimmed = id?.trim();
        if (!trimmed) continue;
        if (!options.force && next[trimmed]) continue;
        if (next[trimmed] === title) continue;
        next[trimmed] = title;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, []);

  const trackGuiSession = useCallback((...ids: Array<string | null | undefined>) => {
    setGuiTrackedSessionIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of ids) {
        const trimmed = id?.trim();
        if (!trimmed || next.has(trimmed)) continue;
        next.add(trimmed);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, []);

  const rememberActiveSession = useCallback((gatewayId: string | null, dbKey?: string | null) => {
    if (!gatewayId) return;
    lastActiveGatewaySessionIdRef.current = gatewayId;
    if (dbKey) {
      lastActiveDbSessionKeyRef.current = dbKey;
      setTrackedDbSessionId(dbKey);
    }
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    const dbKey = sessionKeyByGatewayId[sessionId] ?? null;
    rememberActiveSession(sessionId, dbKey);
    trackGuiSession(sessionId, dbKey ?? undefined);
  }, [rememberActiveSession, sessionId, sessionKeyByGatewayId, trackGuiSession]);

  useEffect(() => {
    const timer = setTimeout(() => {
      persistSessionTracker();
    }, 250);
    return () => clearTimeout(timer);
  }, [persistSessionTracker]);

  const linkSessionIds = useCallback((gatewayId: string, dbKey: string) => {
    if (!gatewayId || !dbKey) return;
    knownGatewayIdsRef.current.add(gatewayId);
    trackGuiSession(gatewayId, dbKey);
    setSessionPurposeTitles((prev) => aliasPurposeTitles(prev, gatewayId, dbKey));
    setSessionKeyByGatewayId((prev) => ({ ...prev, [gatewayId]: dbKey }));
    setGatewayIdBySessionKey((prev) => ({ ...prev, [dbKey]: gatewayId }));
    setSessionRuntime((prev) => {
      const gatewayRuntime = prev[gatewayId];
      const dbRuntime = prev[dbKey];
      if (!gatewayRuntime && !dbRuntime) return prev;
      const merged = gatewayRuntime ?? dbRuntime!;
      return { ...prev, [gatewayId]: merged, [dbKey]: merged };
    });
  }, [trackGuiSession]);

  const rememberGatewaySession = useCallback((gatewayId: string) => {
    if (!gatewayId) return;
    knownGatewayIdsRef.current.add(gatewayId);
  }, []);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    subagentsRef.current = subagents;
  }, [subagents]);

  useEffect(() => {
    subagentsBySessionIdRef.current = subagentsBySessionId;
  }, [subagentsBySessionId]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    let cancelled = false;
    void resolveBridgeToken(url).then((token) => {
      if (!cancelled && token) setBridgeToken(token);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const setUrl = useCallback((nextUrl: string) => {
    try {
      setUrlState(normalizeBridgeUrl(nextUrl));
    } catch (error: any) {
      setStatus(error.message ?? "Invalid bridge URL");
    }
  }, []);

  const isBlocked = Boolean(
    overlay.approval || overlay.clarify || overlay.sudo || overlay.secret,
  );

  const clearOverlay = useCallback(() => {
    setOverlay(EMPTY_OVERLAY);
  }, []);

  const appendSystemMessage = useCallback((text: string, status?: ChatMessage["status"]) => {
    setMessages((prev) => {
      const next = appendSystemTranscriptMessage(prev, text, status);
      if (next === prev) return prev;

      streamingMessageId.current = null;
      const gatewayId = sessionIdRef.current;
      const dbKey = gatewayId ? sessionKeyByGatewayIdRef.current[gatewayId] : undefined;
      persistSessionTranscript(
        gatewayId,
        dbKey,
        next,
        sessionTranscriptsRef.current,
        sessionKeyByGatewayIdRef.current,
        gatewayIdBySessionKeyRef.current,
        { includeInProgress: true },
      );
      return next;
    });
  }, []);

  const appendAgentAction = useCallback((action: AgentAction) => {
    appendSystemMessage(
      serializeAgentAction(action),
      action.status === "error" ? "error" : undefined,
    );
  }, [appendSystemMessage]);

  const persistCompletedMissionSummary = useCallback((items: SubagentProgress[]) => {
    const activeId = sessionIdRef.current;
    if (!activeId || items.length === 0) return;

    const allTerminal = items.every((item) =>
      item.status === "completed" || item.status === "failed" || item.status === "interrupted",
    );
    if (!allTerminal) return;

    const dbKey = sessionKeyByGatewayIdRef.current[activeId];
    const title =
      sessionsRef.current.find((session) => session.id === dbKey || session.id === activeId)?.title ??
      activeId;
    const completedAt =
      items.reduce((latest, item) => {
        const finishedAt =
          item.startedAt != null && item.durationSeconds != null
            ? item.startedAt + item.durationSeconds * 1000
            : item.startedAt ?? latest;
        return Math.max(latest, finishedAt);
      }, 0) || Date.now();
    const summary = createMissionSummary(activeId, title, items, completedAt);
    if (summary.status === "running") return;

    setMissionSummaries((prev) => {
      const existing = prev[summary.sessionId];
      if (
        existing?.status === summary.status &&
        existing?.completedAt === summary.completedAt &&
        existing?.summaryText === summary.summaryText &&
        existing?.agentCount === summary.agentCount &&
        existing?.toolCount === summary.toolCount &&
        existing?.filesTouched === summary.filesTouched
      ) {
        return prev;
      }
      const next = upsertMissionSummary(prev, summary, [activeId, dbKey]);
      saveMissionSummaries(next);
      return next;
    });
  }, []);

  const sessionIdsForEvent = useCallback((eventSessionId: string) => {
    const dbKey = sessionKeyByGatewayIdRef.current[eventSessionId];
    return [eventSessionId, dbKey].filter(Boolean) as string[];
  }, []);

  const loadSubagentsForSession = useCallback((gatewayId: string) => {
    const items = subagentsForAliases(
      subagentsBySessionIdRef.current,
      sessionIdsForEvent(gatewayId),
    );
    setSubagents(items);
  }, [sessionIdsForEvent]);

  const stashCurrentSessionSubagents = useCallback(() => {
    const gatewayId = sessionIdRef.current;
    if (!gatewayId) return;
    setSubagentsBySessionId((prev) =>
      stashSubagentsForSession(prev, sessionIdsForEvent(gatewayId), subagentsRef.current),
    );
  }, [sessionIdsForEvent]);

  const clearSessionSubagents = useCallback((eventSessionId: string) => {
    setSubagentsBySessionId((prev) =>
      stashSubagentsForSession(prev, sessionIdsForEvent(eventSessionId), []),
    );
  }, [sessionIdsForEvent]);

  const recordSubagentEvent = useCallback((
    eventSessionId: string,
    type: string,
    data: SubagentEventPayload,
  ) => {
    const sessionIds = sessionIdsForEvent(eventSessionId);
    setSubagentsBySessionId((prev) => applySubagentEventForSession(prev, sessionIds, type, data));

    const isActive = eventMatchesActiveSession(
      eventSessionId,
      sessionIdRef.current,
      sessionKeyByGatewayIdRef.current,
      gatewayIdBySessionKeyRef.current,
    );
    if (!isActive) return;

    setSubagents((prev) => {
      const next = applySubagentEvent(prev, type, data);
      if (type === "subagent.complete") {
        persistCompletedMissionSummary(next);
      }
      return next;
    });
  }, [persistCompletedMissionSummary, sessionIdsForEvent]);

  const patchSessionRuntime = useCallback((sid: string, patch: Partial<SessionRuntimeState>) => {
    if (!sid) return;
    setSessionRuntime((prev) => {
      const keys = new Set<string>([sid]);
      const dbKey = sessionKeyByGatewayIdRef.current[sid];
      if (dbKey) keys.add(dbKey);
      const gatewayId = gatewayIdBySessionKeyRef.current[sid];
      if (gatewayId) keys.add(gatewayId);

      const next = { ...prev };
      for (const key of keys) {
        const current = next[key] ?? {
          running: false,
          blocked: false,
          activity: "",
          updatedAt: 0,
        };
        next[key] = {
          ...current,
          ...patch,
          updatedAt: Date.now(),
        };
      }
      return next;
    });
  }, []);

  const markSessionRunning = useCallback((sid: string, activity = "Working…") => {
    patchSessionRuntime(sid, { running: true, blocked: false, activity });
  }, [patchSessionRuntime]);

  const markSessionIdle = useCallback((sid: string, activity = "Idle") => {
    patchSessionRuntime(sid, { running: false, blocked: false, activity });
  }, [patchSessionRuntime]);

  const markSessionBlocked = useCallback((sid: string, activity: string) => {
    patchSessionRuntime(sid, { running: true, blocked: true, activity });
  }, [patchSessionRuntime]);

  const bumpSessionLastResponseAt = useCallback((targetSessionId: string, at = Date.now()) => {
    if (!targetSessionId) return;
    const keys = new Set<string>([targetSessionId]);
    const dbKey = sessionKeyByGatewayIdRef.current[targetSessionId];
    if (dbKey) keys.add(dbKey);
    const gatewayId = gatewayIdBySessionKeyRef.current[targetSessionId];
    if (gatewayId) keys.add(gatewayId);

    setSessionLastResponseAt((prev) => {
      const next = { ...prev };
      for (const key of keys) {
        next[key] = Math.max(prev[key] ?? 0, at);
      }
      return next;
    });
  }, []);

  const rpc = useCallback((method: string, params: Record<string, unknown> = {}) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("WebSocket is not connected"));
    }
    const id = nextId.current++;
    ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    return new Promise((resolve, reject) => {
      pending.current.set(id, { resolve, reject });
      setTimeout(() => {
        const item = pending.current.get(id);
        if (item) {
          pending.current.delete(id);
          reject(new Error(`${method} timed out`));
        }
      }, 60_000);
    });
  }, []);

  const applyGatewaySessionTitle = useCallback((
    gatewayId: string,
    dbKey: string | null | undefined,
    title: string,
  ) => {
    const normalized = normalizeGatewaySessionTitle(title);
    if (!normalized) return;
    rememberSessionPurpose(normalized, [gatewayId, dbKey], { force: false });
    if (dbKey) {
      setSessions((prev) => prev.map((session) =>
        session.id === dbKey && (!session.title?.trim() || /^Running · /i.test(session.title))
          ? { ...session, title: normalized }
          : session,
      ));
    }
  }, [rememberSessionPurpose]);

  const syncSessionTitleFromGateway = useCallback(async (gatewayId: string) => {
    if (!gatewayId || titleSyncInFlightRef.current.has(gatewayId)) return;
    titleSyncInFlightRef.current.add(gatewayId);
    try {
      const result: any = await rpc("session.title", { session_id: gatewayId });
      const dbKey = sessionKeyByGatewayIdRef.current[gatewayId] ?? null;
      applyGatewaySessionTitle(gatewayId, dbKey, String(result?.title ?? ""));
    } catch {
      // Auto-title may still be generating in Hermes.
    } finally {
      titleSyncInFlightRef.current.delete(gatewayId);
    }
  }, [applyGatewaySessionTitle, rpc]);

  const scheduleSessionTitleSync = useCallback((gatewayId: string, delayMs = 0) => {
    if (!gatewayId) return;
    const existing = titleSyncTimersRef.current.get(gatewayId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      titleSyncTimersRef.current.delete(gatewayId);
      void syncSessionTitleFromGateway(gatewayId);
    }, delayMs);
    titleSyncTimersRef.current.set(gatewayId, timer);
  }, [syncSessionTitleFromGateway]);

  useEffect(() => () => {
    for (const timer of titleSyncTimersRef.current.values()) {
      clearTimeout(timer);
    }
    titleSyncTimersRef.current.clear();
  }, []);

  const respondWith = useCallback(
    async (method: string, params: Record<string, unknown>, onDone: () => void) => {
      try {
        const result = await rpc(method, params);
        if (result != null) {
          onDone();
        }
      } catch (error: any) {
        setStatus(`${method} failed: ${error.message ?? "unknown error"}`);
      }
    },
    [rpc],
  );

  const dismissAttentionRequest = useCallback((requestId: string | undefined) => {
    if (!requestId) return;
    setAttentionRequests((prev) => removeAttentionRequest(prev, requestId));
  }, []);

  const recordAttentionRequest = useCallback((type: string, data: Record<string, unknown>, eventSessionId: string) => {
    if (!eventSessionId) return null;
    if (!["approval.request", "clarify.request", "sudo.request", "secret.request"].includes(type)) return null;
    const request = attentionRequestFromEvent(type, data, eventSessionId);
    setAttentionRequests((prev) => upsertAttentionRequest(prev, request));
    return request;
  }, []);

  const openAttentionRequest = useCallback((requestId: string) => {
    const request = attentionRequestsRef.current.find((item) => item.id === requestId);
    if (!request) {
      setStatus("Attention request is no longer available");
      return;
    }
    setOverlay((prev) => ({ ...prev, ...overlayPatchFromAttention(request) }));
    setStatus(`${request.title} · ${request.sessionId.slice(0, 8)}`);
  }, []);

  const attentionRequestForOverlay = useCallback((attentionId?: string) => {
    if (!attentionId) return null;
    return attentionRequestsRef.current.find((item) => item.id === attentionId) ?? null;
  }, []);

  const attentionTargetSession = useCallback((sessionId?: string) => (
    sessionId ? resolveGatewaySessionId(
      sessionId,
      sessionKeyByGatewayIdRef.current,
      gatewayIdBySessionKeyRef.current,
      knownGatewayIdsRef.current,
    ) ?? sessionId : sessionIdRef.current
  ), []);

  const persistStoredTranscriptUpdate = useCallback((
    targetSessionId: string,
    updater: (messages: ChatMessage[]) => ChatMessage[],
  ) => {
    if (!targetSessionId) return;
    const { gatewayId, dbKey } = resolveStoredSessionKeys(
      targetSessionId,
      sessionKeyByGatewayIdRef.current,
      gatewayIdBySessionKeyRef.current,
      knownGatewayIdsRef.current,
    );
    const current = recallSessionTranscript(
      gatewayId,
      dbKey,
      sessionTranscriptsRef.current,
      sessionKeyByGatewayIdRef.current,
      gatewayIdBySessionKeyRef.current,
    );
    const next = updater(current);
    if (next.length === 0) return;
    persistSessionTranscript(
      gatewayId,
      dbKey,
      next,
      sessionTranscriptsRef.current,
      sessionKeyByGatewayIdRef.current,
      gatewayIdBySessionKeyRef.current,
      { includeInProgress: true },
    );
  }, []);

  const answerApproval = useCallback(
    (choice: ApprovalChoice) => {
      const approval = overlay.approval;
      const sid = attentionTargetSession(approval?.sessionId);
      if (!sid) return;
      void respondWith("approval.respond", { session_id: sid, choice }, () => {
        dismissAttentionRequest(approval?.attentionId);
        setOverlay((prev) => ({ ...prev, approval: null }));
        setStatus(choice === "deny" ? "Approval denied" : "running…");
      });
    },
    [attentionTargetSession, dismissAttentionRequest, overlay.approval, respondWith],
  );

  const answerClarify = useCallback(
    (answer: string) => {
      const clarify = overlay.clarify;
      if (!clarify) return;
      const targetSessionId = clarify.sessionId;
      const sid = attentionTargetSession(targetSessionId);
      void respondWith(
        "clarify.respond",
        { request_id: clarify.requestId, answer, ...(sid ? { session_id: sid } : {}) },
        () => {
          if (answer) {
            const message: ChatMessage = {
              id: `clarify-${Date.now()}`,
              role: "user",
              text: answer,
              createdAt: Date.now(),
            };
            const targetsActiveSession = !targetSessionId || eventMatchesActiveSession(
              targetSessionId,
              sessionIdRef.current,
              sessionKeyByGatewayIdRef.current,
              gatewayIdBySessionKeyRef.current,
            );
            if (targetsActiveSession) {
              setMessages((prev) => [...prev, message]);
            } else {
              persistStoredTranscriptUpdate(targetSessionId, (messages) => [...messages, message]);
            }
            setStatus("running…");
          } else {
            setStatus("Prompt cancelled");
          }
          dismissAttentionRequest(clarify.attentionId);
          setOverlay((prev) => ({ ...prev, clarify: null }));
        },
      );
    },
    [attentionTargetSession, dismissAttentionRequest, overlay.clarify, persistStoredTranscriptUpdate, respondWith],
  );

  const answerSudo = useCallback(
    (password: string) => {
      const sudo = overlay.sudo;
      if (!sudo) return;
      const sid = attentionTargetSession(sudo.sessionId);
      void respondWith(
        "sudo.respond",
        { request_id: sudo.requestId, password, ...(sid ? { session_id: sid } : {}) },
        () => {
          dismissAttentionRequest(sudo.attentionId);
          setOverlay((prev) => ({ ...prev, sudo: null }));
          setStatus(password ? "running…" : "sudo cancelled");
        },
      );
    },
    [attentionTargetSession, dismissAttentionRequest, overlay.sudo, respondWith],
  );

  const answerSecret = useCallback(
    (value: string) => {
      const secret = overlay.secret;
      if (!secret) return;
      const sid = attentionTargetSession(secret.sessionId);
      void respondWith(
        "secret.respond",
        { request_id: secret.requestId, value, ...(sid ? { session_id: sid } : {}) },
        () => {
          dismissAttentionRequest(secret.attentionId);
          setOverlay((prev) => ({ ...prev, secret: null }));
          setStatus(value ? "running…" : "Secret entry cancelled");
        },
      );
    },
    [attentionTargetSession, dismissAttentionRequest, overlay.secret, respondWith],
  );

  const appendBackgroundSystemMessage = useCallback((
    eventSessionId: string,
    text: string,
    status?: ChatMessage["status"],
  ) => {
    persistStoredTranscriptUpdate(eventSessionId, (messages) =>
      appendSystemTranscriptMessage(messages, text, status),
    );
  }, [persistStoredTranscriptUpdate]);

  const handleEvent = useCallback((frame: RpcFrame) => {
    const type = eventType(frame);
    const data = payload(frame);
    if (!type) return;

    const eventSessionId = sessionIdFromFrame(frame) ?? "";
    const activeSessionId = sessionIdRef.current;
    const attentionRequest = recordAttentionRequest(type, data, eventSessionId || activeSessionId || "");

    const trackRuntime = () => {
      if (!eventSessionId) return;
      rememberGatewaySession(eventSessionId);
      switch (type) {
        case "message.start":
          markSessionRunning(eventSessionId, "Replying…");
          break;
        case "message.complete":
          markSessionIdle(eventSessionId, "Ready");
          break;
        case "tool.start":
          markSessionRunning(eventSessionId, `Running ${String(data.name ?? "tool")}…`);
          break;
        case "tool.progress":
          markSessionRunning(
            eventSessionId,
            String(data.preview ?? data.name ?? "Working…"),
          );
          break;
        case "tool.complete":
          markSessionRunning(eventSessionId, "Working…");
          break;
        case "thinking.delta":
        case "reasoning.delta": {
          const snippet = String(data.text ?? "").trim();
          markSessionRunning(
            eventSessionId,
            snippet ? snippet.slice(0, 72) : "Thinking…",
          );
          break;
        }
        case "approval.request":
          markSessionBlocked(eventSessionId, "Approval needed");
          break;
        case "clarify.request":
          markSessionBlocked(eventSessionId, "Waiting for input…");
          break;
        case "sudo.request":
          markSessionBlocked(eventSessionId, "sudo password needed");
          break;
        case "secret.request":
          markSessionBlocked(eventSessionId, "Secret input needed");
          break;
        case "error":
          markSessionIdle(eventSessionId, "Error");
          break;
        case "subagent.spawn_requested":
          markSessionRunning(eventSessionId, "Delegating…");
          break;
        case "subagent.start":
          markSessionRunning(
            eventSessionId,
            String(data.goal ?? data.preview ?? "Subagent running…").slice(0, 72),
          );
          break;
        case "subagent.thinking":
          markSessionRunning(
            eventSessionId,
            String(data.text ?? "Subagent thinking…").trim().slice(0, 72) || "Subagent thinking…",
          );
          break;
        case "subagent.tool":
          markSessionRunning(
            eventSessionId,
            String(data.tool_name ?? data.tool_preview ?? "Subagent tool…").slice(0, 72),
          );
          break;
        case "subagent.progress":
          markSessionRunning(
            eventSessionId,
            String(data.text ?? "Subagent progress…").trim().slice(0, 72) || "Subagent progress…",
          );
          break;
        case "subagent.complete":
          markSessionRunning(eventSessionId, "Delegation finishing…");
          break;
        default:
          break;
      }
    };

    trackRuntime();

    if (
      eventSessionId &&
      activeSessionId &&
      !eventMatchesActiveSession(
        eventSessionId,
        activeSessionId,
        sessionKeyByGatewayIdRef.current,
        gatewayIdBySessionKeyRef.current,
      ) &&
      !type.startsWith("gateway.")
    ) {
      switch (type) {
        case "thinking.delta":
        case "reasoning.delta": {
          const snippet = String(data.text ?? "");
          if (snippet) {
            persistStoredTranscriptUpdate(eventSessionId, (messages) =>
              applyReasoningDeltaToMessages(messages, snippet),
            );
          }
          break;
        }
        case "reasoning.available": {
          const snippet = String(data.text ?? "").trim();
          if (snippet) {
            persistStoredTranscriptUpdate(eventSessionId, (messages) => {
              const streamingId = findActiveReasoningTargetId(messages);
              if (streamingId) {
                return messages.map((message) =>
                  message.id === streamingId
                    ? {
                        ...message,
                        reasoning: message.reasoning?.includes(snippet)
                          ? message.reasoning
                          : `${message.reasoning ?? ""}${snippet}`,
                      }
                    : message,
                );
              }
              return appendReasoningSnippet(messages, snippet).messages;
            });
          }
          break;
        }
        case "message.start": {
          persistStoredTranscriptUpdate(eventSessionId, (messages) => {
            if (findStreamingAssistantId(messages)) return messages;
            return appendStreamingAssistantBubble(messages).messages;
          });
          break;
        }
        case "message.delta": {
          const text = String(data.text ?? "");
          if (!text) break;
          persistStoredTranscriptUpdate(eventSessionId, (messages) => {
            const streamingId = findStreamingAssistantId(messages);
            if (streamingId) {
              return messages.map((message) =>
                message.id === streamingId
                  ? { ...message, text: message.text + text }
                  : message,
              );
            }
            const { messages: next, id } = appendStreamingAssistantBubble(messages);
            return next.map((message) =>
              message.id === id ? { ...message, text: message.text + text } : message,
            );
          });
          break;
        }
        case "message.complete": {
          const text = String(data.text ?? "");
          const reasoning = String(data.reasoning ?? "").trim();
          persistStoredTranscriptUpdate(eventSessionId, (messages) =>
            applyMessageCompleteToMessages(
              messages,
              text,
              reasoning,
              (data.status as ChatMessage["status"]) ?? "complete",
            ),
          );
          bumpSessionLastResponseAt(eventSessionId);
          scheduleSessionTitleSync(eventSessionId, 2500);
          break;
        }
        case "tool.start":
        case "tool.complete":
        case "status.update":
        case "approval.request":
        case "clarify.request":
        case "sudo.request":
        case "secret.request": {
          const activityAction = liveActivityAction(type, data);
          const activityText = liveActivityMessageText(type, data);
          if (activityText && activityAction && isRenderableActivity(activityAction)) {
            appendBackgroundSystemMessage(eventSessionId, activityText);
          }
          break;
        }
        case "subagent.spawn_requested":
        case "subagent.start":
        case "subagent.thinking":
        case "subagent.tool":
        case "subagent.progress":
        case "subagent.complete":
          recordSubagentEvent(eventSessionId, type, data as SubagentEventPayload);
          break;
        default:
          break;
      }

      const backgroundActivity =
        type === "tool.start"
          ? `Running ${String(data.name ?? "tool")}…`
          : type === "thinking.delta" || type === "reasoning.delta"
            ? String(data.text ?? "Thinking…").trim().slice(0, 72) || "Thinking…"
            : type === "approval.request"
              ? "Approval needed"
              : type === "clarify.request"
                ? "Waiting for input…"
                : "Working…";
      setStatus(`Agent running in ${eventSessionId.slice(0, 8)} · ${backgroundActivity}`);
      return;
    }

    switch (type) {
      case "gateway.ready":
        setStatus("Gateway ready");
        break;
      case "session.info":
        setStatus(data.model ? `Ready · ${data.model}` : "Ready");
        break;
      case "message.start": {
        setBusy(true);
        setMessages((prev) => {
          const { messages, id } = appendStreamingAssistantBubble(prev);
          streamingMessageId.current = id;
          return messages;
        });
        break;
      }
      case "message.delta": {
        const text = String(data.text ?? "");
        if (!text) break;
        setMessages((prev) => {
          let id = streamingMessageId.current;
          const activeTarget = id && prev.some((message) => message.id === id && message.status === "streaming")
            ? id
            : findActiveReasoningTargetId(prev);
          if (activeTarget) {
            id = activeTarget;
            streamingMessageId.current = activeTarget;
            return prev.map((message) =>
              message.id === id ? { ...message, text: message.text + text } : message,
            );
          }

          const { messages: next, id: createdId } = appendStreamingAssistantBubble(prev);
          streamingMessageId.current = createdId;
          return next.map((message) =>
            message.id === createdId ? { ...message, text: message.text + text } : message,
          );
        });
        break;
      }
      case "thinking.delta":
      case "reasoning.delta": {
        const snippet = String(data.text ?? "");
        if (!snippet) break;
        setBusy(true);
        setMessages((prev) => {
          const { messages: next, id } = appendReasoningSnippet(prev, snippet);
          streamingMessageId.current = id;
          return next;
        });
        break;
      }
      case "reasoning.available": {
        const snippet = String(data.text ?? "").trim();
        if (!snippet) break;
        setBusy(true);
        setMessages((prev) => {
          const streamingId = findActiveReasoningTargetId(prev);
          if (streamingId) {
            streamingMessageId.current = streamingId;
            return prev.map((message) =>
              message.id === streamingId
                ? {
                    ...message,
                    reasoning: message.reasoning?.includes(snippet)
                      ? message.reasoning
                      : `${message.reasoning ?? ""}${snippet}`,
                  }
                : message,
            );
          }
          const { messages: next, id } = appendReasoningSnippet(prev, snippet);
          streamingMessageId.current = id;
          return next;
        });
        break;
      }
      case "message.complete": {
        const id = streamingMessageId.current;
        const text =
          String(data.text ?? "").trim() ||
          joinSubagentSummaries(subagentsRef.current);
        const reasoning = String(data.reasoning ?? "").trim();
        setBusy(false);
        persistCompletedMissionSummary(subagentsRef.current);
        setTools((prev) => prev.map((t) => ({ ...t, status: "complete" })));
        if (id) {
          setMessages((prev) => {
            const next = coalesceAssistantReasoningTurns(
              prev.map((m) =>
                m.id === id
                  ? {
                      ...m,
                      text: text || m.text,
                      reasoning: reasoning || m.reasoning,
                      status: data.status ?? "complete",
                    }
                  : m,
              ),
            );
            const gatewayId = sessionIdRef.current;
            const dbKey = gatewayId ? sessionKeyByGatewayIdRef.current[gatewayId] : undefined;
            persistSessionTranscript(
              gatewayId,
              dbKey,
              next,
              sessionTranscriptsRef.current,
              sessionKeyByGatewayIdRef.current,
              gatewayIdBySessionKeyRef.current,
            );
            return next;
          });
        } else {
          setMessages((prev) => {
            const next = coalesceAssistantReasoningTurns(
              applyMessageCompleteToMessages(
                prev,
                text,
                reasoning,
                (data.status as ChatMessage["status"]) ?? "complete",
              ),
            );
            const gatewayId = sessionIdRef.current;
            const dbKey = gatewayId ? sessionKeyByGatewayIdRef.current[gatewayId] : undefined;
            persistSessionTranscript(
              gatewayId,
              dbKey,
              next,
              sessionTranscriptsRef.current,
              sessionKeyByGatewayIdRef.current,
              gatewayIdBySessionKeyRef.current,
            );
            return next;
          });
        }
        streamingMessageId.current = null;
        void refreshSessionsRef.current();
        {
          const gatewayId = sessionIdRef.current;
          if (gatewayId) {
            bumpSessionLastResponseAt(gatewayId);
            scheduleSessionTitleSync(gatewayId, 2500);
          }
        }
        break;
      }
      case "tool.start":
        setBusy(true);
        {
          const activityAction = liveActivityAction(type, data);
          const activityText = liveActivityMessageText(type, data);
          if (activityText && activityAction && isRenderableActivity(activityAction)) {
            appendSystemMessage(activityText);
          }
        }
        setTools((prev) => [
          {
            id: data.tool_id ?? `${Date.now()}`,
            name: data.name ?? "tool",
            status: "running" as const,
            preview: data.context,
            startedAt: Date.now(),
            rawPayload: data,
          },
          ...prev,
        ].slice(0, 20));
        break;
      case "tool.progress":
        setTools((prev) => [
          {
            id: `progress-${Date.now()}`,
            name: data.name ?? "tool",
            status: "running" as const,
            preview: data.preview,
            startedAt: Date.now(),
            rawPayload: data,
          },
          ...prev,
        ].slice(0, 20));
        break;
      case "tool.complete":
        setTools((prev) =>
          prev.map((t) =>
            t.id === data.tool_id
              ? {
                  ...t,
                  status: data.error ? "error" : "complete",
                  result: data.result ?? data.preview,
                  summary: data.summary != null ? String(data.summary) : t.summary,
                  inlineDiff: extractInlineDiff(data) ?? t.inlineDiff,
                  error: data.error ? String(data.error) : undefined,
                  completedAt: Date.now(),
                  rawPayload: data,
                }
              : t,
          ),
        );
        {
          const activityAction = liveActivityAction(type, data);
          if (activityAction && isRenderableActivity(activityAction)) {
            appendAgentAction(activityAction);
          }
        }
        break;
      case "status.update": {
        const activityAction = liveActivityAction(type, data);
        const activityText = liveActivityMessageText(type, data);
        if (activityText && activityAction && isRenderableActivity(activityAction)) {
          appendSystemMessage(activityText);
        }
        break;
      }
      case "approval.request":
        {
          const activityAction = liveActivityAction(type, data);
          if (activityAction) appendAgentAction(activityAction);
        }
        if (attentionRequest) {
          setOverlay((prev) => ({ ...prev, ...overlayPatchFromAttention(attentionRequest) }));
        } else {
          setOverlay((prev) => ({
            ...prev,
            approval: {
              command: String(data.command ?? ""),
              description: String(data.description ?? "dangerous command"),
              sessionId: eventSessionId || activeSessionId || undefined,
            },
          }));
        }
        setStatus("approval needed");
        break;
      case "clarify.request":
        {
          const activityAction = liveActivityAction(type, data);
          if (activityAction) appendAgentAction(activityAction);
        }
        if (attentionRequest) {
          setOverlay((prev) => ({ ...prev, ...overlayPatchFromAttention(attentionRequest) }));
        } else {
          setOverlay((prev) => ({
            ...prev,
            clarify: {
              question: String(data.question ?? ""),
              choices: Array.isArray(data.choices) ? data.choices.map(String) : null,
              requestId: String(data.request_id ?? ""),
              sessionId: eventSessionId || activeSessionId || undefined,
            },
          }));
        }
        setStatus("waiting for input…");
        break;
      case "sudo.request":
        {
          const activityAction = liveActivityAction(type, data);
          if (activityAction) appendAgentAction(activityAction);
        }
        if (attentionRequest) {
          setOverlay((prev) => ({ ...prev, ...overlayPatchFromAttention(attentionRequest) }));
        } else {
          setOverlay((prev) => ({
            ...prev,
            sudo: {
              requestId: String(data.request_id ?? ""),
              sessionId: eventSessionId || activeSessionId || undefined,
            },
          }));
        }
        setStatus("sudo password needed");
        break;
      case "secret.request":
        {
          const activityAction = liveActivityAction(type, data);
          if (activityAction) appendAgentAction(activityAction);
        }
        if (attentionRequest) {
          setOverlay((prev) => ({ ...prev, ...overlayPatchFromAttention(attentionRequest) }));
        } else {
          setOverlay((prev) => ({
            ...prev,
            secret: {
              envVar: String(data.env_var ?? ""),
              prompt: String(data.prompt ?? "Secret required"),
              requestId: String(data.request_id ?? ""),
              sessionId: eventSessionId || activeSessionId || undefined,
            },
          }));
        }
        setStatus("secret input needed");
        break;
      case "error":
        setBusy(false);
        appendAgentAction({
          kind: "error",
          title: "Error",
          detail: String(data.message ?? "unknown"),
          status: "error",
        });
        break;
      case "subagent.spawn_requested":
      case "subagent.start":
      case "subagent.thinking":
      case "subagent.tool":
      case "subagent.progress":
      case "subagent.complete":
        recordSubagentEvent(eventSessionId, type, data as SubagentEventPayload);
        break;
      default:
        if (type.endsWith(".request")) {
          setMessages((prev) => [
            ...prev,
            {
              id: `request-${Date.now()}`,
              role: "system",
              text: summarizeUnknownRequest(type, data),
              createdAt: Date.now(),
            },
          ]);
        }
    }
  }, [appendAgentAction, appendBackgroundSystemMessage, appendSystemMessage, bumpSessionLastResponseAt, markSessionBlocked, markSessionIdle, markSessionRunning, persistStoredTranscriptUpdate, recordAttentionRequest, recordSubagentEvent, rememberGatewaySession, scheduleSessionTitleSync]);

  const runningSessionIds = useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const id of Object.keys(sessionRuntime)) {
      const canonical = sessionKeyByGatewayId[id] ?? id;
      if (seen.has(canonical)) continue;
      const runtime = resolveRuntimeForAliases(
        runtimeAliasesForSession(canonical, sessionKeyByGatewayId, gatewayIdBySessionKey),
        sessionRuntime,
      );
      if (!runtime?.running) continue;
      seen.add(canonical);
      ids.push(canonical);
    }
    return ids;
  }, [gatewayIdBySessionKey, sessionRuntime, sessionKeyByGatewayId]);

  useEffect(() => {
    if (!connected) return;

    const syncRunningTitles = () => {
      const seen = new Set<string>();
      for (const [runtimeId, runtime] of Object.entries(sessionRuntime)) {
        if (!runtime.running) continue;
        const gatewayId = fleetTargetGatewayId(
          runtimeId,
          sessionKeyByGatewayId,
          gatewayIdBySessionKey,
        );
        if (!gatewayId || seen.has(gatewayId)) continue;
        seen.add(gatewayId);

        const dbKey = sessionKeyByGatewayId[gatewayId] ?? runtimeId;
        const aliases = [gatewayId, dbKey];
        const serverTitle = sessions.find((session) => session.id === dbKey)?.title;
        if (!shouldSyncSessionTitle(dbKey, {
          purposeTitles: sessionPurposeTitles,
          aliasIds: aliases,
          serverTitle,
          context: { runtimeActivity: runtime.activity },
        })) {
          continue;
        }
        void syncSessionTitleFromGateway(gatewayId);
      }
    };

    syncRunningTitles();
    const interval = setInterval(syncRunningTitles, 5000);
    return () => clearInterval(interval);
  }, [
    connected,
    gatewayIdBySessionKey,
    sessionKeyByGatewayId,
    sessionPurposeTitles,
    sessionRuntime,
    sessions,
    syncSessionTitleFromGateway,
  ]);

  const activeDbSessionId = sessionId
    ? sessionKeyByGatewayId[sessionId] ?? trackedDbSessionId
    : trackedDbSessionId;

  const unsavedLiveSessions = useMemo((): SessionSummary[] => {
    const listedIds = new Set(sessions.map((session) => session.id));
    const extras: SessionSummary[] = [];
    const seen = new Set<string>();

    for (const [gatewayId, dbKey] of Object.entries(sessionKeyByGatewayId)) {
      const runtime = sessionRuntime[gatewayId] ?? (dbKey ? sessionRuntime[dbKey] : undefined);
      if (!runtime?.running || !dbKey || seen.has(dbKey) || listedIds.has(dbKey)) continue;
      seen.add(dbKey);
      extras.push({
        id: dbKey,
        title: resolveSessionPurposeTitle(dbKey, {
          purposeTitles: sessionPurposeTitles,
          aliasIds: [gatewayId],
          serverTitle: dbKey === activeDbSessionId ? "Current chat" : undefined,
        }) || (dbKey === activeDbSessionId ? "Current chat" : `Agent · ${dbKey.slice(0, 8)}`),
        preview: runtime.activity || "Agent running",
        started_at: runtime.updatedAt ?? Date.now(),
        last_response_at: runtime.updatedAt ?? Date.now(),
        message_count: 0,
        source: "live",
      });
    }

    return extras;
  }, [activeDbSessionId, sessionKeyByGatewayId, sessionPurposeTitles, sessionRuntime, sessions]);

  const matchesActiveSession = useCallback(
    (target: string) => {
      if (!target || !sessionId) return false;
      return (
        target === sessionId ||
        target === activeDbSessionId ||
        target === trackedDbSessionId ||
        gatewayIdBySessionKey[target] === sessionId ||
        sessionKeyByGatewayId[target] === activeDbSessionId ||
        sessionKeyByGatewayId[target] === trackedDbSessionId
      );
    },
    [activeDbSessionId, gatewayIdBySessionKey, sessionId, sessionKeyByGatewayId, trackedDbSessionId],
  );

  const backgroundRunningSessionId = useMemo(() => {
    const activeCanonical = activeDbSessionId ?? sessionId;
    return runningSessionIds.find((id) => id !== activeCanonical && id !== sessionId) ?? null;
  }, [activeDbSessionId, runningSessionIds, sessionId]);

  const resolveSessionRuntime = useCallback((targetId: string): SessionRuntimeState | undefined => {
    return resolveRuntimeForAliases(
      runtimeAliasesForSession(targetId, sessionKeyByGatewayId, gatewayIdBySessionKey),
      sessionRuntime,
    );
  }, [gatewayIdBySessionKey, sessionKeyByGatewayId, sessionRuntime]);

  const activeRuntime = sessionId
    ? resolveSessionRuntime(activeDbSessionId ?? sessionId)
    : undefined;
  const activeSessionBusy = isComposerBusy(busy, activeRuntime);

  const syncGatewaySessionStatus = useCallback(async (gatewayId: string) => {
    if (!gatewayId) return;
    try {
      const result: any = await rpc("session.status", { session_id: gatewayId });
      const parsed = parseSessionStatus(String(result?.output ?? ""));
      if (parsed.sessionKey) {
        linkSessionIds(gatewayId, parsed.sessionKey);
      }
      if (parsed.running) {
        markSessionRunning(gatewayId, "Working…");
      } else {
        markSessionIdle(gatewayId);
      }
    } catch (error: any) {
      const message = String(error?.message ?? "");
      if (message.includes("session not found") || message.includes("4001")) {
        markSessionIdle(gatewayId, "Closed");
        knownGatewayIdsRef.current.delete(gatewayId);
      }
    }
  }, [linkSessionIds, markSessionIdle, markSessionRunning, rpc]);

  /** Route live gateway events to this browser tab (Hermes binds async events to last RPC transport). */
  const claimSessionTransport = useCallback(async (gatewayId: string) => {
    if (!gatewayId) return;
    try {
      const result: any = await rpc("session.status", { session_id: gatewayId });
      const parsed = parseSessionStatus(String(result?.output ?? ""));
      if (parsed.sessionKey) {
        linkSessionIds(gatewayId, parsed.sessionKey);
      }
    } catch {
      // Session may have closed between listing and focus.
    }
  }, [linkSessionIds, rpc]);

  const applySessionSnapshot = useCallback((
    gatewayId: string,
    snapshot: SessionSnapshot,
    options: { updateTranscript?: boolean; transcript?: ChatMessage[] } = {},
  ) => {
    const updateTranscript = options.updateTranscript !== false;
    const dbKey = snapshot.session_key || sessionKeyByGatewayIdRef.current[gatewayId] || "";
    const sessionKeyByGateway = dbKey
      ? { ...sessionKeyByGatewayIdRef.current, [gatewayId]: dbKey }
      : sessionKeyByGatewayIdRef.current;
    const gatewayBySessionKey = dbKey
      ? { ...gatewayIdBySessionKeyRef.current, [dbKey]: gatewayId }
      : gatewayIdBySessionKeyRef.current;
    const activeSessionId = sessionIdRef.current;
    const appliesToActiveSession = Boolean(
      activeSessionId &&
        (eventMatchesActiveSession(
          gatewayId,
          activeSessionId,
          sessionKeyByGateway,
          gatewayBySessionKey,
        ) ||
          (dbKey
            ? eventMatchesActiveSession(
                dbKey,
                activeSessionId,
                sessionKeyByGateway,
                gatewayBySessionKey,
              )
            : false)),
    );
    if (dbKey) {
      linkSessionIds(gatewayId, dbKey);
    }
    rememberGatewaySession(gatewayId);

    let resolvedMessages = messagesRef.current;
    if (updateTranscript && appliesToActiveSession) {
      let nextMessages = coalesceAssistantReasoningTurns(
        options.transcript
          ?? (snapshot.running ? appendInProgressBubble(mapHistoryMessages(snapshot.messages)) : mapHistoryMessages(snapshot.messages)),
      );
      nextMessages = finalizePolledTranscript(nextMessages);
      resolvedMessages = nextMessages;
      const sessionActive = snapshotIndicatesActiveWork(snapshot, nextMessages);
      if (!sessionActive) {
        nextMessages = nextMessages.map((message) =>
          message.status === "streaming"
            ? { ...message, status: "complete" as const }
            : message,
        );
        resolvedMessages = nextMessages;
        streamingMessageId.current = null;
      } else {
        const streaming = nextMessages.find((message) => message.status === "streaming");
        streamingMessageId.current = streaming?.id ?? null;
      }
      setMessages(nextMessages);
      persistSessionTranscript(
        gatewayId,
        dbKey || undefined,
        nextMessages,
        sessionTranscriptsRef.current,
        sessionKeyByGatewayIdRef.current,
        gatewayIdBySessionKeyRef.current,
      );
    }

    const sessionActive = snapshotIndicatesActiveWork(snapshot, resolvedMessages);

    if (sessionActive) {
      markSessionRunning(gatewayId, snapshot.activity || "Working…");
      if (appliesToActiveSession) {
        setBusy(true);
        setTools(mapSnapshotTools(snapshot));
      }
    } else {
      markSessionIdle(gatewayId, "Ready");
      if (appliesToActiveSession) {
        streamingMessageId.current = null;
        setBusy(false);
        setTools((prev) => prev.map((tool) => ({ ...tool, status: "complete" as const })));
      }
    }

    // Loaded transcripts are persisted locally so reconnects can recover history.
  }, [linkSessionIds, markSessionIdle, markSessionRunning, rememberGatewaySession]);

  const stashCurrentSessionTranscript = useCallback(() => {
    const gatewayId = sessionIdRef.current;
    if (!gatewayId) return;
    const dbKey = sessionKeyByGatewayIdRef.current[gatewayId];
    stashActiveSessionTranscript(
      gatewayId,
      dbKey,
      messagesRef.current,
      sessionTranscriptsRef.current,
      sessionKeyByGatewayIdRef.current,
      gatewayIdBySessionKeyRef.current,
    );
  }, []);

  const loadSessionTranscript = useCallback(async (
    gatewayId: string,
    snapshot: SessionSnapshot,
  ): Promise<ChatMessage[]> => {
    const dbKey = snapshot.session_key || sessionKeyByGatewayIdRef.current[gatewayId] || "";
    const memoryMessages = mapHistoryMessages(snapshot.messages ?? []);
    let dbMessages: ChatMessage[] = [];

    try {
      const historyResult: any = await rpc("session.history", { session_id: gatewayId });
      dbMessages = mapHistoryMessages(
        Array.isArray(historyResult?.messages) ? historyResult.messages : [],
      );
    } catch {
      dbMessages = memoryMessages;
    }

    const recalled = recallSessionTranscript(
      gatewayId,
      dbKey || undefined,
      sessionTranscriptsRef.current,
      sessionKeyByGatewayIdRef.current,
      gatewayIdBySessionKeyRef.current,
    );
    const cachedMessages = pickRicherTranscript(
      loadCachedTranscript(gatewayId),
      dbKey ? loadCachedTranscript(dbKey) : [],
    );
    const localMessages = pickRicherTranscript(cachedMessages, recalled);
    const serverBase = pickRicherTranscript(dbMessages, memoryMessages);
    let merged = reconcileTranscriptHistory(serverBase, localMessages);
    merged = enrichTranscriptWithReasoning(merged, localMessages);
    merged = finalizeTranscriptHistory(merged);
    if (
      snapshot.running &&
      (snapshot.active_tools.length > 0 || !transcriptTurnLooksComplete(merged))
    ) {
      merged = appendInProgressBubble(merged);
    }
    return merged;
  }, [rpc]);

  const syncSessionView = useCallback(async (
    gatewayId: string,
    options: { updateTranscript?: boolean; mergeWithCurrent?: boolean } = {},
  ) => {
    if (!gatewayId) return null;
    const snapshot = await fetchSessionSnapshot(url, gatewayId);
    if (!snapshot) return null;

    let transcript: ChatMessage[] | undefined;
    if (options.updateTranscript !== false) {
      transcript = await loadSessionTranscript(gatewayId, snapshot);
      if (options.mergeWithCurrent) {
        transcript = pickRicherTranscript(transcript, messagesRef.current);
        transcript = enrichTranscriptWithReasoning(transcript, messagesRef.current);
        transcript = mergeLiveActivityMessages(transcript, messagesRef.current);
      }
      transcript = coalesceAssistantReasoningTurns(transcript);
      transcript = finalizeTranscriptHistory(transcript);
    }

    applySessionSnapshot(gatewayId, snapshot, {
      updateTranscript: options.updateTranscript,
      transcript,
    });
    return snapshot;
  }, [applySessionSnapshot, loadSessionTranscript, url]);

  const findLiveGatewayForTarget = useCallback(
    (target: string, live: Awaited<ReturnType<typeof fetchLiveGatewaySessions>>): string | null =>
      resolveLiveGatewayForTarget(
        target,
        live,
        sessionKeyByGatewayIdRef.current,
        gatewayIdBySessionKeyRef.current,
      ),
    [],
  );

  const discoverLiveSessions = useCallback(async () => {
    const live = await fetchLiveGatewaySessions(url);
    const liveGatewayIds = new Set(live.map((session) => session.gateway_id));

    for (const gatewayId of [...knownGatewayIdsRef.current]) {
      if (!liveGatewayIds.has(gatewayId)) {
        knownGatewayIdsRef.current.delete(gatewayId);
      }
    }

    const dbByGateway: Record<string, string> = { ...sessionKeyByGatewayIdRef.current };
    const gatewayByDb: Record<string, string> = { ...gatewayIdBySessionKeyRef.current };
    for (const session of live) {
      if (session.session_key) {
        dbByGateway[session.gateway_id] = session.session_key;
        gatewayByDb[session.session_key] = session.gateway_id;
      }
    }
    for (const [dbKey, gatewayId] of Object.entries(gatewayByDb)) {
      if (liveGatewayIds.has(gatewayId) || gatewayId === sessionIdRef.current) continue;
      delete gatewayByDb[dbKey];
      if (dbByGateway[gatewayId] === dbKey) {
        delete dbByGateway[gatewayId];
      }
    }
    sessionKeyByGatewayIdRef.current = dbByGateway;
    gatewayIdBySessionKeyRef.current = gatewayByDb;
    setSessionKeyByGatewayId(dbByGateway);
    setGatewayIdBySessionKey(gatewayByDb);

    const savedDbIds = new Set(sessionsRef.current.map((session) => session.id));
    const shouldTrackLiveSession = (gatewayId: string, sessionKey: string) =>
      guiTrackedSessionIdsRef.current.has(gatewayId) ||
      (sessionKey && guiTrackedSessionIdsRef.current.has(sessionKey)) ||
      (sessionKey && savedDbIds.has(sessionKey)) ||
      gatewayId === sessionIdRef.current ||
      sessionKey === lastActiveDbSessionKeyRef.current;

    for (const session of live) {
      rememberGatewaySession(session.gateway_id);
      if (!shouldTrackLiveSession(session.gateway_id, session.session_key)) continue;
      if (session.running) {
        markSessionRunning(session.gateway_id, session.activity || "Working…");
        if (session.session_key) {
          markSessionRunning(session.session_key, session.activity || "Working…");
        }
      } else {
        markSessionIdle(session.gateway_id, "Ready");
        if (session.session_key) {
          markSessionIdle(session.session_key, "Ready");
        }
      }
    }

    setSessionRuntime((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        const gatewayId = gatewayIdBySessionKeyRef.current[id] ?? id;
        const dbKey = sessionKeyByGatewayIdRef.current[id] ?? sessionKeyByGatewayIdRef.current[gatewayId];
        const stillLive = liveGatewayIds.has(id) || liveGatewayIds.has(gatewayId);
        const tracked =
          guiTrackedSessionIdsRef.current.has(id) ||
          guiTrackedSessionIdsRef.current.has(gatewayId) ||
          (dbKey ? guiTrackedSessionIdsRef.current.has(dbKey) : false) ||
          (dbKey ? savedDbIds.has(dbKey) : false) ||
          id === sessionIdRef.current ||
          gatewayId === sessionIdRef.current;
        if (!stillLive) {
          delete next[id];
          continue;
        }
        if (!tracked && !next[id]?.running && !next[id]?.blocked) {
          delete next[id];
        }
      }
      return next;
    });

    return live;
  }, [markSessionIdle, markSessionRunning, rememberGatewaySession, url]);

  const focusLiveSession = useCallback(async (gatewayId: string) => {
    if (!gatewayId) throw new Error("Missing gateway session id");
    const previousGatewayId = sessionIdRef.current;
    await claimSessionTransport(gatewayId);

    const switchingSessions = Boolean(previousGatewayId && previousGatewayId !== gatewayId);
    const snapshot = await fetchSessionSnapshot(url, gatewayId);
    if (!snapshot) {
      const [historyResult, statusResult]: any[] = await Promise.all([
        rpc("session.history", { session_id: gatewayId }),
        rpc("session.status", { session_id: gatewayId }),
      ]);
      const parsed = parseSessionStatus(String(statusResult?.output ?? ""));
      if (parsed.sessionKey) {
        linkSessionIds(gatewayId, parsed.sessionKey);
      }
      const fallbackSnapshot: SessionSnapshot = {
        gateway_id: gatewayId,
        session_key: parsed.sessionKey || sessionKeyByGatewayIdRef.current[gatewayId] || "",
        running: parsed.running,
        activity: parsed.running ? "Working…" : "",
        messages: Array.isArray(historyResult?.messages) ? historyResult.messages : [],
        active_tools: [],
      };
      const transcript = await loadSessionTranscript(gatewayId, fallbackSnapshot);

      if (switchingSessions) {
        stashCurrentSessionTranscript();
        stashCurrentSessionSubagents();
      }
      rememberGatewaySession(gatewayId);
      setSessionId(gatewayId);
      sessionIdRef.current = gatewayId;
      setOverlay(EMPTY_OVERLAY);
      loadSubagentsForSession(gatewayId);
      setPromptQueue([]);
      applySessionSnapshot(gatewayId, fallbackSnapshot, { transcript });
      setStatus(`Opened live session ${parsed.sessionKey || gatewayId}`);
      rememberActiveSession(gatewayId, parsed.sessionKey || null);
      return;
    }

    let transcript = await loadSessionTranscript(gatewayId, snapshot);
    if (!switchingSessions) {
      transcript = pickRicherTranscript(transcript, messagesRef.current);
      transcript = enrichTranscriptWithReasoning(transcript, messagesRef.current);
      transcript = mergeLiveActivityMessages(transcript, messagesRef.current);
    }
    transcript = coalesceAssistantReasoningTurns(transcript);
    transcript = finalizeTranscriptHistory(transcript);

    if (switchingSessions) {
      stashCurrentSessionTranscript();
      stashCurrentSessionSubagents();
    }
    rememberGatewaySession(gatewayId);
    setSessionId(gatewayId);
    sessionIdRef.current = gatewayId;
    setOverlay(EMPTY_OVERLAY);
    loadSubagentsForSession(gatewayId);
    setPromptQueue([]);

    if (!eventMatchesActiveSession(
      gatewayId,
      sessionIdRef.current,
      snapshot.session_key
        ? { ...sessionKeyByGatewayIdRef.current, [gatewayId]: snapshot.session_key }
        : sessionKeyByGatewayIdRef.current,
      snapshot.session_key
        ? { ...gatewayIdBySessionKeyRef.current, [snapshot.session_key]: gatewayId }
        : gatewayIdBySessionKeyRef.current,
    )) {
      return;
    }
    applySessionSnapshot(gatewayId, snapshot, { transcript });
    setStatus(
      snapshot.running
        ? `Resumed live session · ${snapshot.activity || "Working…"}`
        : `Opened live session ${snapshot.session_key || gatewayId}`,
    );
    rememberActiveSession(gatewayId, snapshot.session_key || null);
  }, [
    claimSessionTransport,
    linkSessionIds,
    loadSessionTranscript,
    loadSubagentsForSession,
    markSessionIdle,
    markSessionRunning,
    mergeLiveActivityMessages,
    rememberActiveSession,
    rememberGatewaySession,
    rpc,
    stashCurrentSessionSubagents,
    stashCurrentSessionTranscript,
    url,
  ]);

  const coldResumeDbSession = useCallback(async (dbKey: string) => {
    const live = await fetchLiveGatewaySessions(url);
    const existing = findLiveGatewayForTarget(dbKey, live);
    if (existing) {
      await focusLiveSession(existing);
      return existing;
    }

    stashCurrentSessionTranscript();
    stashCurrentSessionSubagents();
    setStatus("Resuming session…");
    const result: any = await rpc("session.resume", { session_id: dbKey, cols: 100 });
    const sid = result?.session_id ?? result?.result?.session_id;
    if (!sid) throw new Error("session.resume returned no session_id");
    const resumedKey = String(result?.resumed ?? dbKey);
    linkSessionIds(sid, resumedKey);
    setSessionId(sid);
    sessionIdRef.current = sid;
    rememberGatewaySession(sid);
    setTools([]);
    loadSubagentsForSession(sid);
    setPromptQueue([]);
    setOverlay(EMPTY_OVERLAY);
    setBusy(false);
    streamingMessageId.current = null;
    const restored = Array.isArray(result?.messages) ? result.messages : [];
    const recalled = recallSessionTranscript(
      sid,
      resumedKey,
      sessionTranscriptsRef.current,
      sessionKeyByGatewayIdRef.current,
      gatewayIdBySessionKeyRef.current,
    );
    const resumedMessages = enrichTranscriptWithReasoning(
      pickRicherTranscript(mapHistoryMessages(restored), recalled),
      recalled,
    );
    setMessages(resumedMessages);
    persistSessionTranscript(
      sid,
      resumedKey,
      resumedMessages,
      sessionTranscriptsRef.current,
      sessionKeyByGatewayIdRef.current,
      gatewayIdBySessionKeyRef.current,
    );
    void syncGatewaySessionStatus(sid);
    setStatus(`Resumed ${resumedKey}`);
    rememberActiveSession(sid, resumedKey);
    return sid;
  }, [
    findLiveGatewayForTarget,
    focusLiveSession,
    linkSessionIds,
    rememberActiveSession,
    rememberGatewaySession,
    rpc,
    syncGatewaySessionStatus,
    url,
  ]);

  const resolveLiveGatewayId = useCallback((target: string): string | null => {
    if (!target) return null;
    if (knownGatewayIdsRef.current.has(target)) return target;
    const mapped = gatewayIdBySessionKeyRef.current[target];
    if (mapped) return mapped;
    const dbKey = sessionKeyByGatewayIdRef.current[target];
    if (dbKey && gatewayIdBySessionKeyRef.current[dbKey]) {
      return gatewayIdBySessionKeyRef.current[dbKey];
    }
    return null;
  }, []);

  const canSwitchToSession = useCallback((target: string) => {
    if (!target) return false;
    if (sessions.some((session) => session.id === target)) return true;
    if (gatewayIdBySessionKey[target] || sessionKeyByGatewayId[target]) return true;
    if (knownGatewayIdsRef.current.has(target)) return true;
    return Boolean(resolveSessionRuntime(target)?.running);
  }, [gatewayIdBySessionKey, resolveSessionRuntime, sessionKeyByGatewayId, sessions]);

  const pollLiveSessions = useCallback(async () => {
    const live = await discoverLiveSessions();
    await Promise.all(live.map((session) => syncGatewaySessionStatus(session.gateway_id)));
  }, [discoverLiveSessions, syncGatewaySessionStatus]);

  const refreshSessions = useCallback(async () => {
    const result: any = await rpc("session.list", { limit: 50 });
    const rows = Array.isArray(result?.sessions) ? result.sessions : [];
    setSessions(
      rows.map((s: any) => ({
        id: String(s.id ?? ""),
        title: String(s.title ?? ""),
        preview: String(s.preview ?? ""),
        started_at: Number(s.started_at ?? 0),
        last_response_at: Number(s.last_response_at ?? s.started_at ?? 0),
        message_count: Number(s.message_count ?? 0),
        source: String(s.source ?? ""),
      })).filter((s: SessionSummary) => s.id),
    );
    await pollLiveSessions();
  }, [pollLiveSessions, rpc]);

  const deleteSession = useCallback(async (target: string) => {
    if (!target) throw new Error("Missing session id");
    const live = await fetchLiveGatewaySessions(url);
    const liveMatch = live.find(
      (session) => session.gateway_id === target || session.session_key === target,
    );
    const gatewayId = liveMatch?.gateway_id ?? gatewayIdBySessionKeyRef.current[target];
    const dbKey =
      liveMatch?.session_key ||
      sessionKeyByGatewayIdRef.current[target] ||
      target;
    const runtime =
      (gatewayId ? sessionRuntimeRef.current[gatewayId] : undefined) ??
      sessionRuntimeRef.current[dbKey];

    if (runtime?.running || liveMatch?.running) {
      const message = "Stop the running agent before deleting this session.";
      setStatus(message);
      throw new Error(message);
    }

    if (gatewayId) {
      await rpc("session.close", { session_id: gatewayId });
    }
    await rpc("session.delete", { session_id: dbKey });
    setSessions((prev) => prev.filter((session) => session.id !== dbKey));
    knownGatewayIdsRef.current.delete(target);
    if (gatewayId) knownGatewayIdsRef.current.delete(gatewayId);
    guiTrackedSessionIdsRef.current.delete(target);
    if (gatewayId) guiTrackedSessionIdsRef.current.delete(gatewayId);
    guiTrackedSessionIdsRef.current.delete(dbKey);
    setGuiTrackedSessionIds((prev) => {
      const next = new Set(prev);
      next.delete(target);
      if (gatewayId) next.delete(gatewayId);
      next.delete(dbKey);
      return next;
    });
    setSessionRuntime((prev) => {
      const next = { ...prev };
      delete next[target];
      if (gatewayId) delete next[gatewayId];
      delete next[dbKey];
      return next;
    });
    if (sessionIdRef.current === target || sessionIdRef.current === gatewayId || sessionIdRef.current === dbKey) {
      setSessionId(null);
      sessionIdRef.current = null;
      setMessages([]);
      setTools([]);
      setSubagents([]);
      setPromptQueue([]);
      setBusy(false);
      setOverlay(EMPTY_OVERLAY);
      streamingMessageId.current = null;
    }
    await pollLiveSessions();
    setStatus(`Deleted session ${dbKey.slice(0, 8)}`);
  }, [pollLiveSessions, rpc, url]);

  const resumeSession = useCallback(async (target: string, options?: { force?: boolean }) => {
    if (!target) return;
    try {
      const alreadyActive = matchesActiveSession(target);

      if (alreadyActive && !options?.force) return;

      if (!alreadyActive) {
        stashCurrentSessionTranscript();
      }

      const live = await discoverLiveSessions();
      const liveGateway = findLiveGatewayForTarget(target, live);
      if (liveGateway) {
        await focusLiveSession(liveGateway);
        return;
      }

      const runtime = resolveSessionRuntime(target);
      if (runtime?.running || runtime?.blocked) {
        const gatewayId = fleetTargetGatewayId(
          target,
          sessionKeyByGatewayIdRef.current,
          gatewayIdBySessionKeyRef.current,
        );
        const liveMatch =
          findLiveGatewayForTarget(gatewayId, live) ??
          findLiveGatewayForTarget(target, live);
        if (liveMatch) {
          await focusLiveSession(liveMatch);
          return;
        }
        if (knownGatewayIdsRef.current.has(gatewayId)) {
          await focusLiveSession(gatewayId);
          return;
        }
        throw new Error("That agent is still running but could not be focused. Try refreshing the session list.");
      }

      if (alreadyActive && options?.force) {
        const gatewayId =
          resolveLiveGatewayId(target) ??
          fleetTargetGatewayId(
            target,
            sessionKeyByGatewayIdRef.current,
            gatewayIdBySessionKeyRef.current,
          );
        if (gatewayId && (knownGatewayIdsRef.current.has(gatewayId) || sessionIdRef.current === gatewayId)) {
          await claimSessionTransport(gatewayId);
          await syncSessionView(gatewayId, { updateTranscript: true, mergeWithCurrent: true });
          setStatus(`Reloaded ${trackedDbSessionId ?? target}`);
          return;
        }
      }

      const dbKey = sessions.some((session) => session.id === target)
        ? target
        : sessionKeyByGatewayIdRef.current[target] ?? target;

      await coldResumeDbSession(dbKey);
    } catch (error: any) {
      setStatus(`Session switch failed: ${error?.message ?? "unknown error"}`);
      throw error;
    }
  }, [
    claimSessionTransport,
    coldResumeDbSession,
    discoverLiveSessions,
    findLiveGatewayForTarget,
    focusLiveSession,
    matchesActiveSession,
    resolveLiveGatewayId,
    resolveSessionRuntime,
    sessions,
    stashCurrentSessionTranscript,
    syncSessionView,
    trackedDbSessionId,
  ]);

  useEffect(() => {
    refreshSessionsRef.current = refreshSessions;
  }, [refreshSessions]);

  const attachInitialSession = useCallback(async () => {
    const live = await discoverLiveSessions();
    await refreshSessions();

    if (!autoResumeOnConnectRef.current) {
      setStatus("Connected — open a session or start a new chat");
      return;
    }

    const lastGateway = lastActiveGatewaySessionIdRef.current;
    const lastDb = lastActiveDbSessionKeyRef.current;
    let gatewayId =
      (lastGateway ? findLiveGatewayForTarget(lastGateway, live) : null) ??
      (lastDb ? findLiveGatewayForTarget(lastDb, live) : null);

    if (gatewayId) {
      await focusLiveSession(gatewayId);
      setStatus("Restored your last chat");
      return;
    }

    setStatus("Connected — open a session or start a new chat");
  }, [
    discoverLiveSessions,
    findLiveGatewayForTarget,
    focusLiveSession,
    refreshSessions,
  ]);

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const token = await resolveBridgeToken(url);
    if (token) setBridgeToken(token);
    if (!token) {
      setConnecting(false);
      setStatus("Missing bridge token. Run `npm run serve` or `npm run dev`, then reload this page.");
      return;
    }

    let wsTarget: string;
    try {
      wsTarget = buildAuthenticatedWsUrl(url, token);
    } catch (error: any) {
      setStatus(error.message ?? "Invalid bridge URL");
      return;
    }

    setConnecting(true);
    setStatus("Connecting...");
    let opened = false;
    const ws = new WebSocket(wsTarget);
    wsRef.current = ws;

    ws.onopen = async () => {
      opened = true;
      setConnected(true);
      setConnecting(false);
      setStatus("Connected; syncing sessions...");
      try {
        await attachInitialSession();
        const gatewayId = sessionIdRef.current;
        if (gatewayId) {
          await claimSessionTransport(gatewayId);
          void syncSessionView(gatewayId, { mergeWithCurrent: true });
        }
      } catch (error: any) {
        setStatus(`Session attach failed: ${error.message}`);
      }
    };

    ws.onmessage = (event) => {
      let frame: RpcFrame;
      try {
        frame = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (frame.id != null && pending.current.has(Number(frame.id))) {
        const item = pending.current.get(Number(frame.id))!;
        pending.current.delete(Number(frame.id));
        if (frame.error) item.reject(new Error(frame.error.message ?? "RPC error"));
        else item.resolve(frame.result);
      }
      if (frame.method === "event") handleEvent(frame);
    };

    ws.onclose = (event) => {
      setConnected(false);
      setConnecting(false);
      setOverlay(EMPTY_OVERLAY);
      wsRef.current = null;
      const gatewayId = sessionIdRef.current;
      const dbKey = gatewayId ? sessionKeyByGatewayIdRef.current[gatewayId] : undefined;
      const runtime = sessionRuntimeRef.current;
      const stillRunning =
        Boolean(gatewayId && runtime[gatewayId]?.running) ||
        Boolean(dbKey && runtime[dbKey]?.running);
      if (!stillRunning) {
        setBusy(false);
      }
      if (!opened && event.code === 1008) {
        clearStoredBridgeToken();
        setBridgeToken(null);
        setStatus("Bridge token expired — click Connect again.");
        return;
      }
      setStatus("Disconnected");
    };

    ws.onerror = () => {
      setStatus(
        opened
          ? "WebSocket error."
          : "WebSocket rejected. If the dev server restarted, click Connect again.",
      );
      setConnecting(false);
    };
  }, [attachInitialSession, claimSessionTransport, handleEvent, syncSessionView, url]);

  const syncSessionViewRef = useRef(syncSessionView);
  useEffect(() => {
    syncSessionViewRef.current = syncSessionView;
  }, [syncSessionView]);

  useEffect(() => {
    if (!connected) return;
    void pollLiveSessions();
    const timer = setInterval(() => {
      void pollLiveSessions();
      const gatewayId = sessionIdRef.current;
      if (!gatewayId) return;
      const dbKey = sessionKeyByGatewayIdRef.current[gatewayId];
      const runtime =
        sessionRuntime[gatewayId] ??
        (dbKey ? sessionRuntime[dbKey] : undefined);
      if (!runtime?.running && !busy) return;
      void syncSessionViewRef.current(gatewayId, {
        updateTranscript: true,
        mergeWithCurrent: true,
      });
    }, 2000);
    return () => clearInterval(timer);
  }, [busy, connected, pollLiveSessions, sessionRuntime]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
  }, []);

  const finalizeInterruptedTurn = useCallback(() => {
    const streamingId = streamingMessageId.current;
    if (streamingId) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingId ? { ...m, status: "interrupted" as const } : m,
        ),
      );
    }
    streamingMessageId.current = null;
    setBusy(false);
    setOverlay(EMPTY_OVERLAY);
    setTools((prev) => prev.map((t) => ({ ...t, status: "complete" as const })));
    setSubagents([]);
    if (sessionIdRef.current) {
      clearSessionSubagents(sessionIdRef.current);
    }
    setPromptQueue([]);
  }, [clearSessionSubagents]);

  const hintInterruptArmed = useCallback(() => {
    setStatus("Press Enter again to stop");
  }, []);

  const interruptSession = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) throw new Error("No session yet");
    setStatus("Stopping…");
    finalizeInterruptedTurn();
    try {
      await rpc("session.interrupt", { session_id: sid });
      setStatus("Stopped");
    } catch (error: any) {
      setStatus(`Interrupt failed: ${error.message ?? "unknown error"}`);
      throw error;
    }
  }, [finalizeInterruptedTurn, rpc]);

  const createSession = useCallback(async () => {
    stashCurrentSessionTranscript();
    const result: any = await rpc("session.create", { cols: 100 });
    const sid = result?.session_id ?? result?.result?.session_id;
    if (!sid) throw new Error("session.create returned no session_id");
    setSessionId(sid);
    sessionIdRef.current = sid;
    rememberGatewaySession(sid);
    trackGuiSession(sid);
    setMessages([]);
    setTools([]);
    setSubagents([]);
    clearSessionSubagents(sid);
    setPromptQueue([]);
    setOverlay(EMPTY_OVERLAY);
    setBusy(false);
    streamingMessageId.current = null;
    void syncGatewaySessionStatus(sid);
    rememberActiveSession(sid, null);
    setStatus("New session ready");
    return sid;
  }, [clearSessionSubagents, rememberActiveSession, rememberGatewaySession, rpc, stashCurrentSessionTranscript, syncGatewaySessionStatus, trackGuiSession]);

  const appendOptimisticUserMessage = useCallback((text: string, id?: string) => {
    const gatewaySessionId = resolveGatewaySessionId(
      sessionIdRef.current,
      sessionKeyByGatewayIdRef.current,
      gatewayIdBySessionKeyRef.current,
      knownGatewayIdsRef.current,
    );
    if (!gatewaySessionId) return null;
    const dbKey = sessionKeyByGatewayIdRef.current[gatewaySessionId];
    const { message, messages: next } = appendLocalUserTurn(messagesRef.current, text, { id });
    messagesRef.current = next;
    setMessages(next);
    persistSessionTranscript(
      gatewaySessionId,
      dbKey,
      next,
      sessionTranscriptsRef.current,
      sessionKeyByGatewayIdRef.current,
      gatewayIdBySessionKeyRef.current,
    );
    return message.id;
  }, []);

  const removeOptimisticUserMessage = useCallback((messageId: string) => {
    const gatewaySessionId = resolveGatewaySessionId(
      sessionIdRef.current,
      sessionKeyByGatewayIdRef.current,
      gatewayIdBySessionKeyRef.current,
      knownGatewayIdsRef.current,
    );
    if (!gatewaySessionId) return;
    const dbKey = sessionKeyByGatewayIdRef.current[gatewaySessionId];
    const next = removeTranscriptMessage(messagesRef.current, messageId);
    messagesRef.current = next;
    setMessages(next);
    persistSessionTranscript(
      gatewaySessionId,
      dbKey,
      next,
      sessionTranscriptsRef.current,
      sessionKeyByGatewayIdRef.current,
      gatewayIdBySessionKeyRef.current,
    );
  }, []);

  const appendSlashCommandMessage = useCallback((command: string, id?: string) => {
    const gatewaySessionId = resolveGatewaySessionId(
      sessionIdRef.current,
      sessionKeyByGatewayIdRef.current,
      gatewayIdBySessionKeyRef.current,
      knownGatewayIdsRef.current,
    );
    if (!gatewaySessionId) return null;
    const dbKey = sessionKeyByGatewayIdRef.current[gatewaySessionId];
    const next = appendSlashCommandTurn(messagesRef.current, command, { id });
    if (next === messagesRef.current) return null;
    messagesRef.current = next;
    setMessages(next);
    persistSessionTranscript(
      gatewaySessionId,
      dbKey,
      next,
      sessionTranscriptsRef.current,
      sessionKeyByGatewayIdRef.current,
      gatewayIdBySessionKeyRef.current,
    );
    return next[next.length - 1]?.id ?? null;
  }, []);

  const removeQueuedPrompt = useCallback((text: string) => {
    setPromptQueue((prev) => {
      const index = prev.indexOf(text);
      if (index === -1) return prev;
      return [...prev.slice(0, index), ...prev.slice(index + 1)];
    });
  }, []);

  const removeQueuedPromptAt = useCallback((index: number) => {
    setPromptQueue((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }, []);

  const queuePrompt = useCallback((text: string, options: { optimistic?: boolean } = {}) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (options.optimistic !== false && !transcriptHasPendingUserTurn(messagesRef.current, trimmed)) {
      appendOptimisticUserMessage(trimmed);
    }
    setPromptQueue((prev) => [...prev, trimmed]);
    appendAgentAction(describeQueuedPrompt(trimmed));
    setStatus("Follow-up queued · it will send when Hermes is ready");
  }, [appendAgentAction, appendOptimisticUserMessage]);

  useEffect(() => {
    for (const queued of promptQueue) {
      if (!transcriptHasPendingUserTurn(messagesRef.current, queued)) {
        appendOptimisticUserMessage(queued);
      }
    }
  }, [appendOptimisticUserMessage, promptQueue]);

  const steerPrompt = useCallback(async (text: string) => {
    const gatewaySessionId = resolveGatewaySessionId(
      sessionIdRef.current,
      sessionKeyByGatewayIdRef.current,
      gatewayIdBySessionKeyRef.current,
      knownGatewayIdsRef.current,
    );
    if (!gatewaySessionId) throw new Error("No session yet");
    const trimmed = text.trim();
    if (!trimmed) return;

    removeQueuedPrompt(trimmed);
    if (!transcriptHasPendingUserTurn(messagesRef.current, trimmed)) {
      appendOptimisticUserMessage(trimmed);
    }

    try {
      const result: any = await rpc("session.steer", {
        session_id: gatewaySessionId,
        text: trimmed,
      });
      if (result?.status !== "queued") {
        queuePrompt(trimmed, { optimistic: false });
        setStatus("Steer rejected — queued for next turn");
        return;
      }
      setStatus("Follow-up added to current turn");
    } catch (error: any) {
      queuePrompt(trimmed, { optimistic: false });
      setStatus(`Steer failed — queued for next turn`);
      throw error;
    }
  }, [appendOptimisticUserMessage, queuePrompt, removeQueuedPrompt, rpc]);

  const steerNextQueuedPrompt = useCallback(async () => {
    const next = promptQueueRef.current[0];
    if (!next) return false;
    await steerPrompt(next);
    return true;
  }, [steerPrompt]);

  const sendPrompt = useCallback(async (text: string, options: { optimistic?: boolean } = {}) => {
    const gatewaySessionId = resolveGatewaySessionId(
      sessionIdRef.current,
      sessionKeyByGatewayIdRef.current,
      gatewayIdBySessionKeyRef.current,
      knownGatewayIdsRef.current,
    );
    if (!gatewaySessionId) throw new Error("No session yet");
    const trimmed = text.trim();
    if (!trimmed) return;
    const dbKey = sessionKeyByGatewayIdRef.current[gatewaySessionId];
    rememberSessionPurpose(trimmed, [gatewaySessionId, dbKey]);
    setSubagents([]);
    clearSessionSubagents(gatewaySessionId);
    const optimisticId =
      options.optimistic === false
        ? null
        : appendOptimisticUserMessage(trimmed, `user-${Date.now()}`);
    try {
      await rpc("prompt.submit", { session_id: gatewaySessionId, text: trimmed });
      setBusy(true);
    } catch (error: any) {
      if (isSessionBusyError(error)) {
        queuePrompt(trimmed, { optimistic: false });
        setStatus("Follow-up queued · it will send when Hermes is ready");
        return;
      }
      if (optimisticId) {
        removeOptimisticUserMessage(optimisticId);
      }
      setStatus(`Send failed: ${error.message ?? "unknown error"}`);
      throw error;
    }
  }, [
    appendOptimisticUserMessage,
    clearSessionSubagents,
    queuePrompt,
    rememberSessionPurpose,
    removeOptimisticUserMessage,
    rpc,
  ]);

  const drainPromptQueue = useCallback(async () => {
    if (drainingQueueRef.current || activeSessionBusy || isBlocked) return;
    const next = promptQueueRef.current[0];
    if (!next) return;
    drainingQueueRef.current = true;
    setPromptQueue((prev) => prev.slice(1));
    try {
      await sendPrompt(next, { optimistic: false });
    } catch {
      setPromptQueue((prev) => [next, ...prev]);
    } finally {
      drainingQueueRef.current = false;
    }
  }, [activeSessionBusy, isBlocked, sendPrompt]);

  useEffect(() => {
    if (activeSessionBusy || isBlocked || promptQueue.length === 0) return;
    void drainPromptQueue();
  }, [activeSessionBusy, drainPromptQueue, isBlocked, promptQueue.length]);

  const executeSlashCommand = useCallback(async (
    input: string,
    options: { recordCommand?: boolean } = {},
  ) => {
    const rawTrimmed = input.trim();
    const trimmed = rawTrimmed.toLowerCase().startsWith("terminal ")
      ? "/" + rawTrimmed
      : rawTrimmed;
    if (!trimmed.startsWith("/")) {
      await sendPrompt(rawTrimmed);
      return;
    }

    const body = trimmed.slice(1);
    const [namePart = "", ...rest] = body.split(/\s+/);
    const name = namePart.trim();
    const arg = body.slice(name.length).trimStart();
    if (!name) return;
    if (options.recordCommand !== false) {
      appendSlashCommandMessage(trimmed, `slash-${Date.now()}`);
    }

    if (name === "terminal") {
      setStatus("Running /terminal…");
      appendAgentAction({
        kind: "tool",
        title: "Running local command",
        detail: arg || "(empty command)",
        status: "running",
      });
      try {
        const terminalResult: any = await rpc("terminal.run", { command: arg });
        const commandText = String(terminalResult?.command ?? arg);
        const output = String(terminalResult?.output ?? "(no output)");
        const exitCode = terminalResult?.exit_code ?? "unknown";
        const duration = Number(terminalResult?.duration_seconds);
        const durationText = Number.isFinite(duration) ? duration.toFixed(2) + "s" : "unknown duration";
        appendAgentAction({
          kind: terminalResult?.timed_out ? "error" : "system",
          title: terminalResult?.timed_out ? "Terminal command timed out" : "Terminal command complete",
          detail: [
            "$ " + commandText,
            "",
            output,
            "",
            "Exit code: " + exitCode + " · Duration: " + durationText,
          ].join("\n"),
          status: terminalResult?.timed_out ? "error" : "complete",
        });
        setStatus("/terminal complete");
      } catch (error: any) {
        appendAgentAction({
          kind: "error",
          title: "/terminal failed",
          detail: error.message ?? "unknown error",
          status: "error",
        });
        setStatus("/terminal failed");
        throw error;
      }
      return;
    }

    const gatewaySessionId = resolveGatewaySessionId(
      sessionIdRef.current,
      sessionKeyByGatewayIdRef.current,
      gatewayIdBySessionKeyRef.current,
      knownGatewayIdsRef.current,
    );
    if (!gatewaySessionId) throw new Error("No session yet");

    const renderOutput = (value: any) => {
      const output = String(value?.output ?? value?.status ?? value?.message ?? "");
      if (value?.warning) {
        appendAgentAction({
          kind: "system",
          title: "Warning",
          detail: String(value.warning),
          status: "running",
        });
      }
      if (output && output !== "(no output)") {
        appendAgentAction({
          kind: "system",
          title: "Command output",
          detail: output,
          status: "complete",
        });
      }
    };

    const handleDispatchResult = async (result: any): Promise<boolean> => {
      if (!result || typeof result !== "object") return false;
      if (result.type === "send") {
        if (result.notice) {
          appendAgentAction({
            kind: "system",
            title: "Notice",
            detail: String(result.notice),
            status: "running",
          });
        }
        await sendPrompt(String(result.message ?? ""), { optimistic: false });
        return true;
      }
      if (result.type === "skill") {
        appendAgentAction({
          kind: "system",
          title: "Skill loaded",
          detail: `Loaded /${name} skill context.`,
          status: "complete",
        });
        await sendPrompt(String(result.message ?? ""), { optimistic: false });
        return true;
      }
      if (result.type === "alias" && result.target) {
        const target = String(result.target).trim();
        await executeSlashCommand(
          target.startsWith("/") ? `${target}${arg ? ` ${arg}` : ""}` : `/${target}${arg ? ` ${arg}` : ""}`,
          { recordCommand: false },
        );
        return true;
      }
      if (result.type === "exec" || result.type === "plugin") {
        renderOutput(result);
        return true;
      }
      return false;
    };

    setStatus(`Running /${name}…`);
    try {
      const dispatchResult = await rpc("command.dispatch", {
        session_id: gatewaySessionId,
        name,
        arg,
      });
      if (await handleDispatchResult(dispatchResult)) {
        setStatus(`/${name} complete`);
        return;
      }
    } catch (dispatchError: any) {
      const message = String(dispatchError?.message ?? "");
      if (!message.includes("not a quick/plugin/skill command") && !message.includes("4018")) {
        appendAgentAction({
          kind: "error",
          title: `/${name}`,
          detail: message,
          status: "error",
        });
        setStatus(`/${name} failed`);
        throw dispatchError;
      }
    }

    try {
      const slashResult: any = await rpc("slash.exec", {
        session_id: gatewaySessionId,
        command: trimmed,
      });
      renderOutput(slashResult);
      setStatus(`/${name} complete`);
    } catch (error: any) {
      appendAgentAction({
        kind: "error",
        title: `/${name}`,
        detail: error.message ?? "unknown error",
        status: "error",
      });
      setStatus(`/${name} failed`);
      throw error;
    }
  }, [appendAgentAction, appendSlashCommandMessage, appendSystemMessage, rpc, sendPrompt]);

  const getSlashCompletions = useCallback(async (text: string): Promise<SlashCompletionResult> => {
    const result: any = await rpc("complete.slash", { text });
    const items = Array.isArray(result?.items)
      ? result.items.map((item: any) => ({
          text: String(item.text ?? ""),
          display: item.display == null ? undefined : String(item.display),
          meta: item.meta == null ? undefined : String(item.meta),
        })).filter((item: any) => item.text)
      : [];
    const query = text.trimStart();
    const queryName = query.replace(/^\//, "");
    const shouldOfferTerminal =
      !queryName ||
      "/terminal".startsWith(query) ||
      "terminal".startsWith(queryName);
    const completionItems = shouldOfferTerminal && !items.some((item: any) => item.text === "/terminal" || item.text === "terminal")
      ? [{ text: "/terminal", display: "/terminal", meta: "run a local shell command" }, ...items]
      : items;
    return { items: completionItems, replace_from: Number.isFinite(result?.replace_from) ? Number(result.replace_from) : undefined };
  }, [rpc]);

  const request = useCallback(
    (method: string, params: Record<string, unknown> = {}) =>
      rpc(method, sessionId ? { session_id: sessionId, ...params } : params),
    [rpc, sessionId],
  );

  const getConfigValue = useCallback(
    (key: string) => request("config.get", { key }),
    [request],
  );

  const setConfigValue = useCallback(
    (key: string, value: unknown) => request("config.set", { key, value }),
    [request],
  );

  const getModelOptions = useCallback(
    () => request("model.options"),
    [request],
  );

  const listToolsets = useCallback(
    () => request("toolsets.list"),
    [request],
  );

  const configureToolsets = useCallback(
    (action: "enable" | "disable", names: string[]) =>
      request("tools.configure", { action, names }),
    [request],
  );

  const toggleVoice = useCallback(
    (mode: "on" | "off" | "tts" | "status") => request("voice.toggle", { action: mode }),
    [request],
  );

  const subagentTree = useMemo(() => buildSubagentTree(subagents), [subagents]);
  const delegationActive = useMemo(
    () => delegationIsActive(subagents, busy),
    [subagents, busy],
  );
  const currentMissionSummary = useMemo(() => {
    const activeId = sessionId ?? activeDbSessionId;
    if (!activeId) return null;
    if (subagents.length > 0) {
      const title = sessions.find((session) => session.id === activeDbSessionId || session.id === sessionId)?.title ?? activeId;
      const completedAt = subagents.reduce((latest, item) => {
        const finishedAt = item.startedAt != null && item.durationSeconds != null
          ? item.startedAt + item.durationSeconds * 1000
          : item.startedAt ?? latest;
        return Math.max(latest, finishedAt);
      }, 0) || Date.now();
      return createMissionSummary(activeId, title, subagents, completedAt);
    }
    return missionSummaries[activeId] ?? (activeDbSessionId ? missionSummaries[activeDbSessionId] : null) ?? null;
  }, [activeDbSessionId, missionSummaries, sessionId, sessions, subagents]);

  useEffect(() => {
    if (!currentMissionSummary || currentMissionSummary.status === "running") return;
    setMissionSummaries((prev) => {
      const existing = prev[currentMissionSummary.sessionId];
      if (
        existing?.status === currentMissionSummary.status &&
        existing?.completedAt === currentMissionSummary.completedAt &&
        existing?.summaryText === currentMissionSummary.summaryText &&
        existing?.agentCount === currentMissionSummary.agentCount &&
        existing?.toolCount === currentMissionSummary.toolCount &&
        existing?.filesTouched === currentMissionSummary.filesTouched
      ) {
        return prev;
      }
      const next = upsertMissionSummary(prev, currentMissionSummary, [sessionId, activeDbSessionId]);
      saveMissionSummaries(next);
      return next;
    });
  }, [activeDbSessionId, currentMissionSummary, sessionId]);

  const liveAssistantTurn = useMemo(
    () => messages.find((message) => message.role === "assistant" && message.status === "streaming") ?? null,
    [messages],
  );

  const delegatingSessionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [sessionKey, items] of Object.entries(subagentsBySessionId)) {
      if (delegationIsActive(items, false)) ids.add(sessionKey);
    }
    if (delegationActive && sessionId) {
      ids.add(sessionId);
      const dbKey = sessionKeyByGatewayId[sessionId];
      if (dbKey) ids.add(dbKey);
    }
    return ids;
  }, [delegationActive, sessionId, sessionKeyByGatewayId, subagentsBySessionId]);

  const fleetTranscriptsById = useMemo(() => {
    const map: Record<string, ChatMessage[]> = { ...sessionTranscriptsRef.current };
    if (sessionId && messages.length) {
      map[sessionId] = messages;
      const dbKey = sessionKeyByGatewayId[sessionId];
      if (dbKey) map[dbKey] = messages;
    }

    const ids = new Set<string>([
      ...runningSessionIds,
      ...guiTrackedSessionIds,
      ...Object.keys(sessionKeyByGatewayId),
    ]);
    for (const id of ids) {
      if (map[id]?.length) continue;
      const cached = loadCachedTranscript(id);
      if (cached.length) map[id] = cached;
    }
    for (const [gatewayId, dbKey] of Object.entries(sessionKeyByGatewayId)) {
      if (map[gatewayId]?.length || map[dbKey]?.length) continue;
      const cached = loadCachedTranscript(dbKey);
      if (cached.length) {
        map[dbKey] = cached;
        map[gatewayId] = cached;
      }
    }
    return map;
  }, [guiTrackedSessionIds, messages, runningSessionIds, sessionId, sessionKeyByGatewayId]);

  const fleetSnapshot = useMemo((): FleetSnapshot => buildFleetSnapshot({
    sessionRuntime,
    sessions: [...sessions, ...unsavedLiveSessions],
    missionSummaries,
    attentionRequests,
    sessionKeyByGatewayId,
    gatewayIdBySessionKey,
    activeSessionId: sessionId,
    activeDbSessionId,
    delegatingSessionIds,
    subagentsBySessionId,
    guiTrackedSessionIds: guiTrackedSessionIds,
    sessionPurposeTitles,
    sessionTranscriptsById: fleetTranscriptsById,
  }), [
    activeDbSessionId,
    attentionRequests,
    delegatingSessionIds,
    fleetTranscriptsById,
    gatewayIdBySessionKey,
    guiTrackedSessionIds,
    missionSummaries,
    sessionId,
    sessionKeyByGatewayId,
    sessionPurposeTitles,
    sessionRuntime,
    sessions,
    subagentsBySessionId,
    unsavedLiveSessions,
  ]);

  const resolveTargetGatewayId = useCallback((targetSessionId: string) => {
    return fleetTargetGatewayId(
      targetSessionId,
      sessionKeyByGatewayIdRef.current,
      gatewayIdBySessionKeyRef.current,
    );
  }, []);

  const targetMatchesActiveSession = useCallback((targetSessionId: string) => {
    const gatewayId = resolveTargetGatewayId(targetSessionId);
    const activeGateway = sessionIdRef.current;
    if (!activeGateway) return false;
    return (
      gatewayId === activeGateway ||
      sessionKeyByGatewayIdRef.current[gatewayId] === activeDbSessionId ||
      sessionKeyByGatewayIdRef.current[activeGateway] === targetSessionId ||
      gatewayIdBySessionKeyRef.current[targetSessionId] === activeGateway
    );
  }, [activeDbSessionId, resolveTargetGatewayId]);

  const spawnAgentWithGoal = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) throw new Error("Goal text required");

    const result: any = await rpc("session.create", { cols: 100 });
    const sid = result?.session_id ?? result?.result?.session_id;
    if (!sid) throw new Error("session.create returned no session_id");

    rememberGatewaySession(sid);
    trackGuiSession(sid);
    rememberSessionPurpose(trimmed, [sid], { force: true });
    try {
      await rpc("prompt.submit", { session_id: sid, text: trimmed });
      markSessionRunning(sid, trimmed.slice(0, 72) || "Working…");
      setStatus(`Spawned agent ${sid.slice(0, 8)}`);
      scheduleSessionTitleSync(sid, 3000);
      void refreshSessionsRef.current();
      return sid;
    } catch (error: any) {
      setStatus(`Spawn failed: ${error.message ?? "unknown error"}`);
      throw error;
    }
  }, [markSessionRunning, rememberGatewaySession, rememberSessionPurpose, rpc, scheduleSessionTitleSync, trackGuiSession]);

  const sendPromptToSession = useCallback(async (targetSessionId: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (targetSessionId === FLEET_NEW_AGENT_TARGET) {
      await spawnAgentWithGoal(trimmed);
      return;
    }
    if (targetMatchesActiveSession(targetSessionId)) {
      await sendPrompt(trimmed);
      return;
    }

    const gatewaySessionId = resolveTargetGatewayId(targetSessionId);
    if (!gatewaySessionId) throw new Error("Unknown target session");
    rememberGatewaySession(gatewaySessionId);
    trackGuiSession(
      gatewaySessionId,
      sessionKeyByGatewayIdRef.current[gatewaySessionId],
      gatewayIdBySessionKeyRef.current[gatewaySessionId],
    );
    const dbKey = sessionKeyByGatewayIdRef.current[gatewaySessionId];
    rememberSessionPurpose(trimmed, [gatewaySessionId, dbKey]);
    try {
      await rpc("prompt.submit", { session_id: gatewaySessionId, text: trimmed });
      markSessionRunning(gatewaySessionId, "Working…");
      setStatus(`Prompt sent to ${gatewaySessionId.slice(0, 8)}`);
    } catch (error: any) {
      if (isSessionBusyError(error)) {
        setStatus(`Session ${gatewaySessionId.slice(0, 8)} is busy — open chat to steer or queue`);
        throw error;
      }
      setStatus(`Send failed: ${error.message ?? "unknown error"}`);
      throw error;
    }
  }, [markSessionRunning, rememberGatewaySession, rememberSessionPurpose, resolveTargetGatewayId, rpc, sendPrompt, spawnAgentWithGoal, targetMatchesActiveSession, trackGuiSession]);

  const interruptSessionById = useCallback(async (targetSessionId: string) => {
    const gatewaySessionId = resolveTargetGatewayId(targetSessionId);
    if (!gatewaySessionId) throw new Error("Unknown target session");

    setStatus("Stopping…");
    if (targetMatchesActiveSession(targetSessionId)) {
      finalizeInterruptedTurn();
    }

    try {
      await rpc("session.interrupt", { session_id: gatewaySessionId });
      markSessionIdle(gatewaySessionId, "Stopped");
      setStatus(`Stopped session ${gatewaySessionId.slice(0, 8)} · Ready`);
    } catch (error: any) {
      setStatus(`Interrupt failed: ${error.message ?? "unknown error"}`);
      throw error;
    }
  }, [finalizeInterruptedTurn, markSessionIdle, resolveTargetGatewayId, rpc, targetMatchesActiveSession]);

  const focusSession = useCallback(async (targetSessionId: string, options?: { force?: boolean }) => {
    if (!targetSessionId) return;
    await resumeSession(targetSessionId, options);
  }, [resumeSession]);

  return useMemo(() => ({
    url,
    setUrl,
    connected,
    connecting,
    sessionId,
    messages,
    tools,
    subagents,
    attentionRequests,
    openAttentionRequest,
    missionSummaries,
    currentMissionSummary,
    subagentTree,
    delegationActive,
    liveAssistantTurn,
    promptQueue,
    queuePrompt,
    steerPrompt,
    steerNextQueuedPrompt,
    hintInterruptArmed,
    removeQueuedPromptAt,
    sessions,
    liveResponseAt: sessionLastResponseAt,
    unsavedLiveSessions,
    sessionRuntime,
    sessionKeyByGatewayId,
    gatewayIdBySessionKey,
    activeDbSessionId,
    matchesActiveSession,
    runningSessionIds,
    backgroundRunningSessionId,
    resolveSessionRuntime,
    canSwitchToSession,
    status,
    busy,
    activeSessionBusy,
    overlay,
    isBlocked,
    connect,
    disconnect,
    sendPrompt,
    executeSlashCommand,
    getSlashCompletions,
    createSession,
    refreshSessions,
    resumeSession,
    deleteSession,
    pollLiveSessions,
    answerApproval,
    answerClarify,
    answerSudo,
    answerSecret,
    clearOverlay,
    interruptSession,
    request,
    getConfigValue,
    setConfigValue,
    getModelOptions,
    listToolsets,
    configureToolsets,
    toggleVoice,
    fleetSnapshot,
    sendPromptToSession,
    spawnAgentWithGoal,
    interruptSessionById,
    focusSession,
  }), [
    url,
    connected,
    connecting,
    sessionId,
    messages,
    tools,
    subagents,
    attentionRequests,
    openAttentionRequest,
    missionSummaries,
    currentMissionSummary,
    subagentTree,
    delegationActive,
    liveAssistantTurn,
    promptQueue,
    queuePrompt,
    steerPrompt,
    steerNextQueuedPrompt,
    hintInterruptArmed,
    removeQueuedPromptAt,
    sessions,
    sessionLastResponseAt,
    unsavedLiveSessions,
    sessionRuntime,
    sessionKeyByGatewayId,
    gatewayIdBySessionKey,
    activeDbSessionId,
    matchesActiveSession,
    runningSessionIds,
    backgroundRunningSessionId,
    resolveSessionRuntime,
    canSwitchToSession,
    status,
    busy,
    activeSessionBusy,
    overlay,
    isBlocked,
    connect,
    disconnect,
    sendPrompt,
    executeSlashCommand,
    getSlashCompletions,
    createSession,
    refreshSessions,
    resumeSession,
    deleteSession,
    pollLiveSessions,
    answerApproval,
    answerClarify,
    answerSudo,
    answerSecret,
    clearOverlay,
    interruptSession,
    request,
    getConfigValue,
    setConfigValue,
    getModelOptions,
    listToolsets,
    configureToolsets,
    toggleVoice,
    fleetSnapshot,
    sendPromptToSession,
    spawnAgentWithGoal,
    interruptSessionById,
    focusSession,
  ]);
}
