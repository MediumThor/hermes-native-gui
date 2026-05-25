import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ApprovalChoice,
  ChatMessage,
  OverlayState,
  RpcFrame,
  SessionSummary,
  ToolActivity,
} from "./types";
import { EMPTY_OVERLAY } from "./types";

type Pending = {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
};

const DEFAULT_WS = "ws://127.0.0.1:8766/ws";

function eventType(frame: RpcFrame): string | undefined {
  return frame.method === "event" ? frame.params?.type : undefined;
}

function payload(frame: RpcFrame): any {
  return frame.params?.payload ?? {};
}

function sessionIdFromFrame(frame: RpcFrame): string | undefined {
  return frame.params?.session_id;
}

export function useHermesRpc() {
  const [url, setUrl] = useState(DEFAULT_WS);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tools, setTools] = useState<ToolActivity[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [status, setStatus] = useState("Disconnected");
  const [busy, setBusy] = useState(false);
  const [overlay, setOverlay] = useState<OverlayState>(EMPTY_OVERLAY);
  const wsRef = useRef<WebSocket | null>(null);
  const nextId = useRef(1);
  const pending = useRef<Map<number, Pending>>(new Map());
  const streamingMessageId = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const isBlocked = Boolean(
    overlay.approval || overlay.clarify || overlay.sudo || overlay.secret,
  );

  const clearOverlay = useCallback(() => {
    setOverlay(EMPTY_OVERLAY);
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

    const eventSessionId = sessionIdFromFrame(frame);
    const activeSessionId = sessionIdRef.current;
    if (
      eventSessionId &&
      activeSessionId &&
      eventSessionId !== activeSessionId &&
      !type.startsWith("gateway.")
    ) {
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
      case "message.complete": {
        const id = streamingMessageId.current;
        const text = String(data.text ?? "");
        setBusy(false);
        setTools((prev) => prev.map((t) => ({ ...t, status: "complete" })));
        if (id) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === id
                ? { ...m, text: text || m.text, status: data.status ?? "complete" }
                : m,
            ),
          );
        }
        streamingMessageId.current = null;
        break;
      }
      case "tool.start":
        setTools((prev) => [
          { id: data.tool_id ?? `${Date.now()}`, name: data.name ?? "tool", status: "running" as const, preview: data.context },
          ...prev,
        ].slice(0, 20));
        break;
      case "tool.progress":
        setTools((prev) => [
          { id: `progress-${Date.now()}`, name: data.name ?? "tool", status: "running" as const, preview: data.preview },
          ...prev,
        ].slice(0, 20));
        break;
      case "tool.complete":
        setTools((prev) =>
          prev.map((t) =>
            t.id === data.tool_id
              ? { ...t, status: "complete", result: data.result ?? data.preview }
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
      default:
        if (type.endsWith(".request")) {
          setMessages((prev) => [
            ...prev,
            { id: `request-${Date.now()}`, role: "system", text: `${type}: ${JSON.stringify(data, null, 2)}`, createdAt: Date.now() },
          ]);
        }
    }
  }, []);

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setConnecting(true);
    setStatus("Connecting...");
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = async () => {
      setConnected(true);
      setConnecting(false);
      setStatus("Connected; creating session...");
      try {
        const result: any = await rpc("session.create", { cols: 100 });
        const sid = result?.session_id ?? result?.result?.session_id;
        setSessionId(sid);
        sessionIdRef.current = sid;
        setStatus("Session ready");
      } catch (error: any) {
        setStatus(`Session create failed: ${error.message}`);
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

    ws.onclose = () => {
      setConnected(false);
      setConnecting(false);
      setBusy(false);
      setOverlay(EMPTY_OVERLAY);
      setStatus("Disconnected");
      wsRef.current = null;
    };

    ws.onerror = () => {
      setStatus("WebSocket error. Is `npm run bridge` running?");
      setConnecting(false);
    };
  }, [handleEvent, rpc, url]);

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
    setMessages([]);
    setTools([]);
    setOverlay(EMPTY_OVERLAY);
    setBusy(false);
    streamingMessageId.current = null;
    setStatus("New session ready");
    return sid;
  }, [rpc]);

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
  }, [rpc]);

  const resumeSession = useCallback(async (target: string) => {
    if (!target) return;
    setStatus("Resuming session…");
    const result: any = await rpc("session.resume", { session_id: target, cols: 100 });
    const sid = result?.session_id ?? result?.result?.session_id;
    if (!sid) throw new Error("session.resume returned no session_id");
    setSessionId(sid);
    sessionIdRef.current = sid;
    setTools([]);
    setOverlay(EMPTY_OVERLAY);
    setBusy(false);
    const restored = Array.isArray(result?.messages) ? result.messages : [];
    setMessages(
      restored.map((m: any, index: number) => ({
        id: `restored-${index}-${Date.now()}`,
        role: m.role === "assistant" || m.role === "user" || m.role === "system" ? m.role : "system",
        text: String(m.content ?? m.text ?? ""),
        status: "complete" as const,
        createdAt: Date.now() + index,
      })),
    );
    setStatus(`Resumed ${result?.resumed ?? target}`);
  }, [rpc]);

  const sendPrompt = useCallback(async (text: string) => {
    if (!sessionId) throw new Error("No session yet");
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", text: trimmed, createdAt: Date.now() },
    ]);
    await rpc("prompt.submit", { session_id: sessionId, text: trimmed });
  }, [rpc, sessionId]);

  return useMemo(() => ({
    url,
    setUrl,
    connected,
    connecting,
    sessionId,
    messages,
    tools,
    sessions,
    status,
    busy,
    overlay,
    isBlocked,
    connect,
    disconnect,
    sendPrompt,
    createSession,
    refreshSessions,
    resumeSession,
    answerApproval,
    answerClarify,
    answerSudo,
    answerSecret,
    clearOverlay,
    interruptSession,
  }), [
    url,
    connected,
    connecting,
    sessionId,
    messages,
    tools,
    sessions,
    status,
    busy,
    overlay,
    isBlocked,
    connect,
    disconnect,
    sendPrompt,
    createSession,
    refreshSessions,
    resumeSession,
    answerApproval,
    answerClarify,
    answerSudo,
    answerSecret,
    clearOverlay,
    interruptSession,
  ]);
}
