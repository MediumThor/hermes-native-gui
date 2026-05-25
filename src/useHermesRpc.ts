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
  loadCachedTranscript,
  mergeTranscriptMessages,
  saveCachedTranscript,
} from "./chatTranscriptStorage";
import { summarizeUnknownRequest } from "./requestPayloadSanitizer";
import { isSessionBusyError } from "./promptDelivery";
import {
  applySubagentEvent,
  delegationIsActive,
} from "./subagentReducer";
import { buildSubagentTree } from "./subagentTree";
import type { SubagentEventPayload, SubagentProgress } from "./subagentTypes";
import { EMPTY_OVERLAY } from "./types";

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

function parseSessionStatus(output: string) {
  const sessionKeyMatch = output.match(/^Session ID: (.+)$/m);
  const runningMatch = output.match(/^Agent Running: (Yes|No)$/m);
  return {
    sessionKey: sessionKeyMatch?.[1]?.trim() ?? "",
    running: runningMatch?.[1] === "Yes",
  };
}

function mapHistoryMessages(restored: unknown[]): ChatMessage[] {
  return restored.map((entry, index) => {
    const m = entry as Record<string, unknown>;
    const role = m.role;
    return {
      id: `restored-${index}-${Date.now()}`,
      role: role === "assistant" || role === "user" ? role : "system",
      text: String(m.text ?? m.content ?? m.context ?? ""),
      status: "complete" as const,
      createdAt: Date.now() + index,
    };
  });
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

function transcriptNeedsInProgressBubble(messages: ChatMessage[]): boolean {
  if (messages.length === 0) return false;
  const last = messages[messages.length - 1];
  if (last.status === "streaming") return false;
  return last.role === "user" || last.role === "system";
}

function appendInProgressBubble(messages: ChatMessage[]): ChatMessage[] {
  if (!transcriptNeedsInProgressBubble(messages)) return messages;
  return [
    ...messages,
    {
      id: `assistant-resume-${Date.now()}`,
      role: "assistant",
      text: "",
      status: "streaming",
      createdAt: Date.now(),
    },
  ];
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
  const [promptQueue, setPromptQueue] = useState<string[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
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
  const wsRef = useRef<WebSocket | null>(null);
  const nextId = useRef(1);
  const pending = useRef<Map<number, Pending>>(new Map());
  const streamingMessageId = useRef<string | null>(null);
  const autoResumeOnConnectRef = useRef(options.autoResumeOnConnect ?? false);
  const sessionIdRef = useRef<string | null>(null);
  const knownGatewayIdsRef = useRef<Set<string>>(
    new Set(initialTracker?.knownGatewayIds ?? []),
  );
  const lastActiveDbSessionKeyRef = useRef<string | undefined>(
    initialTracker?.lastActiveDbSessionKey,
  );
  const lastActiveGatewaySessionIdRef = useRef<string | undefined>(
    initialTracker?.lastActiveGatewaySessionId,
  );
  const refreshSessionsRef = useRef<() => Promise<void>>(async () => {});
  const sessionKeyByGatewayIdRef = useRef<Record<string, string>>({});
  const gatewayIdBySessionKeyRef = useRef<Record<string, string>>({});
  const promptQueueRef = useRef<string[]>([]);
  const drainingQueueRef = useRef(false);

  useEffect(() => {
    promptQueueRef.current = promptQueue;
  }, [promptQueue]);

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

  const persistSessionTracker = useCallback(() => {
    const snapshot: SessionTrackerSnapshot = {
      sessionRuntime,
      sessionKeyByGatewayId,
      gatewayIdBySessionKey,
      knownGatewayIds: [...knownGatewayIdsRef.current],
      lastActiveDbSessionKey: lastActiveDbSessionKeyRef.current,
      lastActiveGatewaySessionId: lastActiveGatewaySessionIdRef.current,
    };
    saveSessionTracker(snapshot);
  }, [gatewayIdBySessionKey, sessionKeyByGatewayId, sessionRuntime]);

  const rememberActiveSession = useCallback((gatewayId: string | null, dbKey?: string | null) => {
    if (!gatewayId) return;
    lastActiveGatewaySessionIdRef.current = gatewayId;
    if (dbKey) lastActiveDbSessionKeyRef.current = dbKey;
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    const dbKey = sessionKeyByGatewayId[sessionId] ?? null;
    rememberActiveSession(sessionId, dbKey);
  }, [rememberActiveSession, sessionId, sessionKeyByGatewayId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      persistSessionTracker();
    }, 250);
    return () => clearTimeout(timer);
  }, [persistSessionTracker]);

  const linkSessionIds = useCallback((gatewayId: string, dbKey: string) => {
    if (!gatewayId || !dbKey) return;
    knownGatewayIdsRef.current.add(gatewayId);
    setSessionKeyByGatewayId((prev) => ({ ...prev, [gatewayId]: dbKey }));
    setGatewayIdBySessionKey((prev) => ({ ...prev, [dbKey]: gatewayId }));
    setSessionRuntime((prev) => {
      const gatewayRuntime = prev[gatewayId];
      const dbRuntime = prev[dbKey];
      if (!gatewayRuntime && !dbRuntime) return prev;
      const merged = gatewayRuntime ?? dbRuntime!;
      return { ...prev, [gatewayId]: merged, [dbKey]: merged };
    });
  }, []);

  const rememberGatewaySession = useCallback((gatewayId: string) => {
    if (!gatewayId) return;
    knownGatewayIdsRef.current.add(gatewayId);
  }, []);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

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
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => [
      ...prev,
      {
        id: `system-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role: "system",
        text: trimmed,
        status,
        createdAt: Date.now(),
      },
    ]);
  }, []);

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

  const answerApproval = useCallback(
    (choice: ApprovalChoice) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      void respondWith("approval.respond", { session_id: sid, choice }, () => {
        setOverlay((prev) => ({ ...prev, approval: null }));
        setStatus(choice === "deny" ? "Approval denied" : "running…");
      });
    },
    [respondWith],
  );

  const answerClarify = useCallback(
    (answer: string) => {
      const clarify = overlay.clarify;
      if (!clarify) return;
      void respondWith(
        "clarify.respond",
        { request_id: clarify.requestId, answer },
        () => {
          if (answer) {
            setMessages((prev) => [
              ...prev,
              {
                id: `clarify-${Date.now()}`,
                role: "user",
                text: answer,
                createdAt: Date.now(),
              },
            ]);
            setStatus("running…");
          } else {
            setStatus("Prompt cancelled");
          }
          setOverlay((prev) => ({ ...prev, clarify: null }));
        },
      );
    },
    [overlay.clarify, respondWith],
  );

  const answerSudo = useCallback(
    (password: string) => {
      const sudo = overlay.sudo;
      if (!sudo) return;
      void respondWith(
        "sudo.respond",
        { request_id: sudo.requestId, password },
        () => {
          setOverlay((prev) => ({ ...prev, sudo: null }));
          setStatus(password ? "running…" : "sudo cancelled");
        },
      );
    },
    [overlay.sudo, respondWith],
  );

  const answerSecret = useCallback(
    (value: string) => {
      const secret = overlay.secret;
      if (!secret) return;
      void respondWith(
        "secret.respond",
        { request_id: secret.requestId, value },
        () => {
          setOverlay((prev) => ({ ...prev, secret: null }));
          setStatus(value ? "running…" : "Secret entry cancelled");
        },
      );
    },
    [overlay.secret, respondWith],
  );

  const handleEvent = useCallback((frame: RpcFrame) => {
    const type = eventType(frame);
    const data = payload(frame);
    if (!type) return;

    const eventSessionId = sessionIdFromFrame(frame) ?? "";
    const activeSessionId = sessionIdRef.current;

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
        setSubagents([]);
        const id = `assistant-${Date.now()}`;
        streamingMessageId.current = id;
        setMessages((prev) => [
          ...prev,
          { id, role: "assistant", text: "", status: "streaming", createdAt: Date.now() },
        ]);
        break;
      }
      case "message.delta": {
        const id = streamingMessageId.current;
        const text = String(data.text ?? "");
        if (!id || !text) break;
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, text: m.text + text } : m)),
        );
        break;
      }
      case "thinking.delta":
      case "reasoning.delta": {
        const snippet = String(data.text ?? "");
        if (!snippet) break;
        setMessages((prev) => {
          const id =
            streamingMessageId.current ??
            [...prev].reverse().find((m) => m.role === "assistant" && m.status === "streaming")?.id;
          if (!id) return prev;
          return prev.map((m) =>
            m.id === id ? { ...m, reasoning: `${m.reasoning ?? ""}${snippet}` } : m,
          );
        });
        break;
      }
      case "reasoning.available": {
        const snippet = String(data.text ?? "").trim();
        if (!snippet) break;
        setMessages((prev) => {
          const id =
            streamingMessageId.current ??
            [...prev].reverse().find((m) => m.role === "assistant" && m.status === "streaming")?.id;
          if (!id) return prev;
          return prev.map((m) =>
            m.id === id ? { ...m, reasoning: m.reasoning?.includes(snippet) ? m.reasoning : `${m.reasoning ?? ""}${snippet}` } : m,
          );
        });
        break;
      }
      case "message.complete": {
        const id = streamingMessageId.current;
        const text = String(data.text ?? "");
        const reasoning = String(data.reasoning ?? "").trim();
        setBusy(false);
        setTools((prev) => prev.map((t) => ({ ...t, status: "complete" })));
        if (id) {
          setMessages((prev) =>
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
        }
        streamingMessageId.current = null;
        void refreshSessionsRef.current();
        break;
      }
      case "tool.start":
        setBusy(true);
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
                  error: data.error ? String(data.error) : undefined,
                  completedAt: Date.now(),
                  rawPayload: data,
                }
              : t,
          ),
        );
        break;
      case "status.update":
        setMessages((prev) => [
          ...prev,
          { id: `status-${Date.now()}`, role: "system", text: String(data.text ?? ""), createdAt: Date.now() },
        ]);
        break;
      case "approval.request":
        setOverlay((prev) => ({
          ...prev,
          approval: {
            command: String(data.command ?? ""),
            description: String(data.description ?? "dangerous command"),
          },
        }));
        setStatus("approval needed");
        break;
      case "clarify.request":
        setOverlay((prev) => ({
          ...prev,
          clarify: {
            question: String(data.question ?? ""),
            choices: Array.isArray(data.choices) ? data.choices.map(String) : null,
            requestId: String(data.request_id ?? ""),
          },
        }));
        setStatus("waiting for input…");
        break;
      case "sudo.request":
        setOverlay((prev) => ({
          ...prev,
          sudo: { requestId: String(data.request_id ?? "") },
        }));
        setStatus("sudo password needed");
        break;
      case "secret.request":
        setOverlay((prev) => ({
          ...prev,
          secret: {
            envVar: String(data.env_var ?? ""),
            prompt: String(data.prompt ?? "Secret required"),
            requestId: String(data.request_id ?? ""),
          },
        }));
        setStatus("secret input needed");
        break;
      case "error":
        setBusy(false);
        setMessages((prev) => [
          ...prev,
          { id: `error-${Date.now()}`, role: "system", text: `Error: ${data.message ?? "unknown"}`, status: "error", createdAt: Date.now() },
        ]);
        break;
      case "subagent.spawn_requested":
      case "subagent.start":
      case "subagent.thinking":
      case "subagent.tool":
      case "subagent.progress":
      case "subagent.complete":
        setSubagents((prev) =>
          applySubagentEvent(prev, type, data as SubagentEventPayload),
        );
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
  }, [markSessionBlocked, markSessionIdle, markSessionRunning, rememberGatewaySession]);

  const runningSessionIds = useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const [id, state] of Object.entries(sessionRuntime)) {
      if (!state.running) continue;
      const canonical = sessionKeyByGatewayId[id] ?? id;
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      ids.push(canonical);
    }
    return ids;
  }, [sessionRuntime, sessionKeyByGatewayId]);

  const activeDbSessionId = sessionId ? sessionKeyByGatewayId[sessionId] ?? null : null;

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
        title: dbKey === activeDbSessionId ? "Current chat" : `Running · ${dbKey.slice(-6)}`,
        preview: runtime.activity || "Agent running",
        started_at: runtime.updatedAt ?? Date.now(),
        message_count: 0,
        source: "live",
      });
    }

    return extras;
  }, [activeDbSessionId, sessionKeyByGatewayId, sessionRuntime, sessions]);

  const matchesActiveSession = useCallback(
    (target: string) => {
      if (!target || !sessionId) return false;
      return (
        target === sessionId ||
        target === activeDbSessionId ||
        gatewayIdBySessionKey[target] === sessionId ||
        sessionKeyByGatewayId[target] === activeDbSessionId
      );
    },
    [activeDbSessionId, gatewayIdBySessionKey, sessionId, sessionKeyByGatewayId],
  );

  const backgroundRunningSessionId = useMemo(() => {
    const activeCanonical = activeDbSessionId ?? sessionId;
    return runningSessionIds.find((id) => id !== activeCanonical && id !== sessionId) ?? null;
  }, [activeDbSessionId, runningSessionIds, sessionId]);

  const resolveSessionRuntime = useCallback((targetId: string): SessionRuntimeState | undefined => {
    const direct = sessionRuntime[targetId];
    if (direct) return direct;
    const gatewayId = gatewayIdBySessionKey[targetId];
    if (gatewayId) return sessionRuntime[gatewayId];
    const dbKey = sessionKeyByGatewayId[targetId];
    if (dbKey) return sessionRuntime[dbKey];
    return undefined;
  }, [gatewayIdBySessionKey, sessionKeyByGatewayId, sessionRuntime]);

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

  const applySessionSnapshot = useCallback((
    gatewayId: string,
    snapshot: SessionSnapshot,
    options: { updateTranscript?: boolean } = {},
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

    let nextMessages: ChatMessage[] | null = null;
    if (updateTranscript && appliesToActiveSession) {
      const serverMessages = mapHistoryMessages(snapshot.messages);
      const cachedMessages = snapshot.running
        ? [
            ...loadCachedTranscript(gatewayId),
            ...(dbKey ? loadCachedTranscript(dbKey) : []),
          ]
        : [];
      const merged = snapshot.running
        ? mergeTranscriptMessages(serverMessages, cachedMessages)
        : serverMessages;
      nextMessages = snapshot.running ? appendInProgressBubble(merged) : merged;
      const streaming = nextMessages.find((message) => message.status === "streaming");
      streamingMessageId.current = streaming?.id ?? null;
      setMessages(nextMessages);
    }

    if (snapshot.running) {
      markSessionRunning(gatewayId, snapshot.activity || "Working…");
      if (appliesToActiveSession) {
        setBusy(true);
        setTools(mapSnapshotTools(snapshot));
      }
    } else {
      markSessionIdle(gatewayId, "Ready");
      if (appliesToActiveSession && updateTranscript) {
        if (!streamingMessageId.current) {
          setBusy(false);
        }
        setTools((prev) => prev.map((tool) => ({ ...tool, status: "complete" as const })));
      }
    }

    // Do not write loaded transcripts back to the cache here. The cache is only
    // for the local user prompt of an in-flight turn, written in sendPrompt().
  }, [linkSessionIds, markSessionIdle, markSessionRunning, rememberGatewaySession]);

  const syncSessionView = useCallback(async (
    gatewayId: string,
    options: { updateTranscript?: boolean } = {},
  ) => {
    if (!gatewayId) return null;
    const snapshot = await fetchSessionSnapshot(url, gatewayId);
    if (!snapshot) return null;
    applySessionSnapshot(gatewayId, snapshot, options);
    return snapshot;
  }, [applySessionSnapshot, url]);

  const findLiveGatewayForTarget = useCallback(
    (target: string, live: Awaited<ReturnType<typeof fetchLiveGatewaySessions>>): string | null => {
      if (!target) return null;
      // Only match against the live gateway snapshot — cached refs go stale and
      // can incorrectly route an old db session id to a different live agent.
      for (const session of live) {
        if (session.gateway_id === target || session.session_key === target) {
          return session.gateway_id;
        }
      }
      return null;
    },
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

    const dbByGateway: Record<string, string> = {};
    const gatewayByDb: Record<string, string> = {};
    for (const session of live) {
      if (session.session_key) {
        dbByGateway[session.gateway_id] = session.session_key;
        gatewayByDb[session.session_key] = session.gateway_id;
      }
    }
    sessionKeyByGatewayIdRef.current = dbByGateway;
    gatewayIdBySessionKeyRef.current = gatewayByDb;
    setSessionKeyByGatewayId(dbByGateway);
    setGatewayIdBySessionKey(gatewayByDb);

    for (const session of live) {
      rememberGatewaySession(session.gateway_id);
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
        if (!liveGatewayIds.has(id) && !liveGatewayIds.has(gatewayId)) {
          delete next[id];
        }
      }
      return next;
    });

    return live;
  }, [markSessionIdle, markSessionRunning, rememberGatewaySession, url]);

  const focusLiveSession = useCallback(async (gatewayId: string) => {
    if (!gatewayId) throw new Error("Missing gateway session id");
    rememberGatewaySession(gatewayId);
    setSessionId(gatewayId);
    sessionIdRef.current = gatewayId;
    setOverlay(EMPTY_OVERLAY);
    setSubagents([]);
    setPromptQueue([]);

    const snapshot = await syncSessionView(gatewayId);
    if (!snapshot) {
      const [historyResult, statusResult]: any[] = await Promise.all([
        rpc("session.history", { session_id: gatewayId }),
        rpc("session.status", { session_id: gatewayId }),
      ]);
      const parsed = parseSessionStatus(String(statusResult?.output ?? ""));
      if (parsed.sessionKey) {
        linkSessionIds(gatewayId, parsed.sessionKey);
      }
      const stillActive = eventMatchesActiveSession(
        gatewayId,
        sessionIdRef.current,
        parsed.sessionKey
          ? { ...sessionKeyByGatewayIdRef.current, [gatewayId]: parsed.sessionKey }
          : sessionKeyByGatewayIdRef.current,
        parsed.sessionKey
          ? { ...gatewayIdBySessionKeyRef.current, [parsed.sessionKey]: gatewayId }
          : gatewayIdBySessionKeyRef.current,
      );
      if (!stillActive) return;
      const restored = Array.isArray(historyResult?.messages) ? historyResult.messages : [];
      const serverMessages = mapHistoryMessages(restored);
      const cachedMessages = parsed.running
        ? [
            ...loadCachedTranscript(gatewayId),
            ...(parsed.sessionKey ? loadCachedTranscript(parsed.sessionKey) : []),
          ]
        : [];
      const merged = parsed.running
        ? mergeTranscriptMessages(serverMessages, cachedMessages)
        : serverMessages;
      const withProgress = parsed.running ? appendInProgressBubble(merged) : merged;
      const streaming = withProgress.find((message) => message.status === "streaming");
      streamingMessageId.current = streaming?.id ?? null;
      setMessages(withProgress);
      if (parsed.running) {
        setBusy(true);
        markSessionRunning(gatewayId, "Working…");
      } else {
        setBusy(false);
        markSessionIdle(gatewayId, "Ready");
      }
      setStatus(`Opened live session ${parsed.sessionKey || gatewayId}`);
      rememberActiveSession(gatewayId, parsed.sessionKey || null);
      return;
    }

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
    setStatus(
      snapshot.running
        ? `Resumed live session · ${snapshot.activity || "Working…"}`
        : `Opened live session ${snapshot.session_key || gatewayId}`,
    );
    rememberActiveSession(gatewayId, snapshot.session_key || null);
  }, [
    linkSessionIds,
    markSessionIdle,
    markSessionRunning,
    rememberActiveSession,
    rememberGatewaySession,
    rpc,
    syncSessionView,
  ]);

  const coldResumeDbSession = useCallback(async (dbKey: string) => {
    const live = await fetchLiveGatewaySessions(url);
    const existing = findLiveGatewayForTarget(dbKey, live);
    if (existing) {
      await focusLiveSession(existing);
      return existing;
    }

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
    setSubagents([]);
    setPromptQueue([]);
    setOverlay(EMPTY_OVERLAY);
    setBusy(false);
    streamingMessageId.current = null;
    const restored = Array.isArray(result?.messages) ? result.messages : [];
    setMessages(mapHistoryMessages(restored));
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

  const resumeSession = useCallback(async (target: string) => {
    if (!target) return;

    const live = await discoverLiveSessions();
    const liveGateway = findLiveGatewayForTarget(target, live);
    if (liveGateway) {
      await focusLiveSession(liveGateway);
      return;
    }

    const dbKey = sessions.some((session) => session.id === target)
      ? target
      : sessionKeyByGatewayIdRef.current[target] ?? target;

    await coldResumeDbSession(dbKey);
  }, [coldResumeDbSession, discoverLiveSessions, findLiveGatewayForTarget, focusLiveSession, sessions]);

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
  }, [attachInitialSession, handleEvent, url]);

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
        updateTranscript: !streamingMessageId.current,
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
    setPromptQueue([]);
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
    const result: any = await rpc("session.create", { cols: 100 });
    const sid = result?.session_id ?? result?.result?.session_id;
    if (!sid) throw new Error("session.create returned no session_id");
    setSessionId(sid);
    sessionIdRef.current = sid;
    rememberGatewaySession(sid);
    setMessages([]);
    setTools([]);
    setSubagents([]);
    setPromptQueue([]);
    setOverlay(EMPTY_OVERLAY);
    setBusy(false);
    streamingMessageId.current = null;
    void syncGatewaySessionStatus(sid);
    rememberActiveSession(sid, null);
    setStatus("New session ready");
    return sid;
  }, [rememberActiveSession, rememberGatewaySession, rpc, syncGatewaySessionStatus]);

  const appendOptimisticUserMessage = useCallback((text: string) => {
    const gatewaySessionId = resolveGatewaySessionId(
      sessionIdRef.current,
      sessionKeyByGatewayIdRef.current,
      gatewayIdBySessionKeyRef.current,
      knownGatewayIdsRef.current,
    );
    if (!gatewaySessionId) return;
    setMessages((prev) => {
      const next = [
        ...prev,
        { id: `user-${Date.now()}`, role: "user" as const, text, createdAt: Date.now() },
      ];
      saveCachedTranscript(gatewaySessionId, next);
      const dbKey = sessionKeyByGatewayIdRef.current[gatewaySessionId];
      if (dbKey) saveCachedTranscript(dbKey, next);
      return next;
    });
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

  const queuePrompt = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setPromptQueue((prev) => [...prev, trimmed]);
    setStatus(`Queued · Enter twice to send now`);
  }, []);

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
    appendOptimisticUserMessage(trimmed);

    try {
      const result: any = await rpc("session.steer", {
        session_id: gatewaySessionId,
        text: trimmed,
      });
      if (result?.status !== "queued") {
        setPromptQueue((prev) => [...prev, trimmed]);
        setStatus("Steer rejected — queued for next turn");
        return;
      }
      setStatus("Follow-up added to current turn");
    } catch (error: any) {
      setPromptQueue((prev) => [...prev, trimmed]);
      setStatus(`Steer failed — queued for next turn`);
      throw error;
    }
  }, [appendOptimisticUserMessage, removeQueuedPrompt, rpc]);

  const steerNextQueuedPrompt = useCallback(async () => {
    const next = promptQueueRef.current[0];
    if (!next) return false;
    await steerPrompt(next);
    return true;
  }, [steerPrompt]);

  const sendPrompt = useCallback(async (text: string) => {
    const gatewaySessionId = resolveGatewaySessionId(
      sessionIdRef.current,
      sessionKeyByGatewayIdRef.current,
      gatewayIdBySessionKeyRef.current,
      knownGatewayIdsRef.current,
    );
    if (!gatewaySessionId) throw new Error("No session yet");
    const trimmed = text.trim();
    if (!trimmed) return;
    const optimisticId = `user-${Date.now()}`;
    setMessages((prev) => {
      const next = [
        ...prev,
        { id: optimisticId, role: "user" as const, text: trimmed, createdAt: Date.now() },
      ];
      saveCachedTranscript(gatewaySessionId, next);
      const dbKey = sessionKeyByGatewayIdRef.current[gatewaySessionId];
      if (dbKey) saveCachedTranscript(dbKey, next);
      return next;
    });
    try {
      await rpc("prompt.submit", { session_id: gatewaySessionId, text: trimmed });
      setBusy(true);
    } catch (error: any) {
      setMessages((prev) => prev.filter((message) => message.id !== optimisticId));
      if (isSessionBusyError(error)) {
        setPromptQueue((prev) => [...prev, trimmed]);
        setStatus("Queued · Enter twice to send now");
        return;
      }
      setStatus(`Send failed: ${error.message ?? "unknown error"}`);
      throw error;
    }
  }, [rpc]);

  const drainPromptQueue = useCallback(async () => {
    if (drainingQueueRef.current || busy || isBlocked) return;
    const next = promptQueueRef.current[0];
    if (!next) return;
    drainingQueueRef.current = true;
    setPromptQueue((prev) => prev.slice(1));
    try {
      await sendPrompt(next);
    } catch {
      setPromptQueue((prev) => [next, ...prev]);
    } finally {
      drainingQueueRef.current = false;
    }
  }, [busy, isBlocked, sendPrompt]);

  useEffect(() => {
    if (busy || isBlocked || promptQueue.length === 0) return;
    void drainPromptQueue();
  }, [busy, drainPromptQueue, isBlocked, promptQueue.length]);

  const executeSlashCommand = useCallback(async (input: string) => {
    const trimmed = input.trim();
    if (!trimmed.startsWith("/")) {
      await sendPrompt(trimmed);
      return;
    }

    const gatewaySessionId = resolveGatewaySessionId(
      sessionIdRef.current,
      sessionKeyByGatewayIdRef.current,
      gatewayIdBySessionKeyRef.current,
      knownGatewayIdsRef.current,
    );
    if (!gatewaySessionId) throw new Error("No session yet");

    const body = trimmed.slice(1);
    const [namePart = "", ...rest] = body.split(/\s+/);
    const name = namePart.trim();
    const arg = body.slice(name.length).trimStart();
    if (!name) return;

    const renderOutput = (value: any) => {
      const output = String(value?.output ?? value?.status ?? value?.message ?? "");
      if (value?.warning) appendSystemMessage(String(value.warning));
      if (output && output !== "(no output)") appendSystemMessage(output);
    };

    const handleDispatchResult = async (result: any): Promise<boolean> => {
      if (!result || typeof result !== "object") return false;
      if (result.type === "send") {
        if (result.notice) appendSystemMessage(String(result.notice));
        await sendPrompt(String(result.message ?? ""));
        return true;
      }
      if (result.type === "skill") {
        appendSystemMessage(`Loaded /${name} skill context.`);
        await sendPrompt(String(result.message ?? ""));
        return true;
      }
      if (result.type === "alias" && result.target) {
        const target = String(result.target).trim();
        await executeSlashCommand(target.startsWith("/") ? `${target}${arg ? ` ${arg}` : ""}` : `/${target}${arg ? ` ${arg}` : ""}`);
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
        appendSystemMessage(`/${name}: ${message}`, "error");
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
      appendSystemMessage(`/${name}: ${error.message ?? "unknown error"}`, "error");
      setStatus(`/${name} failed`);
      throw error;
    }
  }, [appendSystemMessage, rpc, sendPrompt]);

  const getSlashCompletions = useCallback(async (text: string): Promise<SlashCompletionResult> => {
    const result: any = await rpc("complete.slash", { text });
    const items = Array.isArray(result?.items)
      ? result.items.map((item: any) => ({
          text: String(item.text ?? ""),
          display: item.display == null ? undefined : String(item.display),
          meta: item.meta == null ? undefined : String(item.meta),
        })).filter((item: any) => item.text)
      : [];
    return { items, replace_from: Number.isFinite(result?.replace_from) ? Number(result.replace_from) : undefined };
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

  const liveAssistantTurn = useMemo(
    () => messages.find((message) => message.role === "assistant" && message.status === "streaming") ?? null,
    [messages],
  );

  return useMemo(() => ({
    url,
    setUrl,
    connected,
    connecting,
    sessionId,
    messages,
    tools,
    subagents,
    subagentTree,
    delegationActive,
    liveAssistantTurn,
    promptQueue,
    queuePrompt,
    steerPrompt,
    steerNextQueuedPrompt,
    removeQueuedPromptAt,
    sessions,
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
  }), [
    url,
    connected,
    connecting,
    sessionId,
    messages,
    tools,
    subagents,
    subagentTree,
    delegationActive,
    liveAssistantTurn,
    promptQueue,
    queuePrompt,
    steerPrompt,
    steerNextQueuedPrompt,
    removeQueuedPromptAt,
    sessions,
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
  ]);
}
