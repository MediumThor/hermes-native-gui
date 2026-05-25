import type { SubagentEventPayload, SubagentProgress, SubagentStatus } from "./subagentTypes";

export function isTerminalSubagentStatus(status: SubagentStatus): boolean {
  return status === "completed" || status === "failed" || status === "interrupted";
}

export function isActiveSubagentStatus(status: SubagentStatus): boolean {
  return status === "queued" || status === "running";
}

function keepTerminalElseRunning(status: SubagentStatus): SubagentStatus {
  return isTerminalSubagentStatus(status) ? status : "running";
}

function pushThinking(items: string[], text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return items;
  const last = items[items.length - 1];
  if (last === trimmed) return items;
  return [...items, trimmed].slice(-24);
}

function pushTool(items: string[], line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) return items;
  return [...items, trimmed].slice(-32);
}

function pushNote(items: string[], text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return items;
  return [...items, trimmed].slice(-16);
}

function formatToolCall(name: string, preview: string): string {
  const tool = name.trim() || "tool";
  const detail = preview.trim();
  return detail ? `${tool}: ${detail}` : tool;
}

function subagentIdFromPayload(payload: SubagentEventPayload): string {
  return payload.subagent_id || `sa:${payload.task_index}:${payload.goal || "subagent"}`;
}

function baseSubagent(payload: SubagentEventPayload, id: string): SubagentProgress {
  return {
    id,
    goal: payload.goal,
    index: payload.task_index,
    depth: payload.depth ?? 0,
    parentId: payload.parent_id ?? null,
    status: "running",
    model: payload.model,
    thinking: [],
    tools: [],
    notes: [],
    toolCount: payload.tool_count ?? 0,
    taskCount: payload.task_count ?? 1,
    startedAt: Date.now(),
    toolsets: payload.toolsets,
  };
}

function mergePayloadFields(
  base: SubagentProgress,
  payload: SubagentEventPayload,
): SubagentProgress {
  const outputTail = payload.output_tail
    ? payload.output_tail.map((entry) => ({
        isError: Boolean(entry.is_error),
        preview: String(entry.preview ?? ""),
        tool: String(entry.tool ?? "tool"),
      }))
    : base.outputTail;

  return {
    ...base,
    apiCalls: payload.api_calls ?? base.apiCalls,
    costUsd: payload.cost_usd ?? base.costUsd,
    depth: payload.depth ?? base.depth,
    filesRead: payload.files_read ?? base.filesRead,
    filesWritten: payload.files_written ?? base.filesWritten,
    goal: payload.goal || base.goal,
    inputTokens: payload.input_tokens ?? base.inputTokens,
    model: payload.model ?? base.model,
    outputTail,
    outputTokens: payload.output_tokens ?? base.outputTokens,
    parentId: payload.parent_id ?? base.parentId,
    taskCount: payload.task_count ?? base.taskCount,
    toolCount: payload.tool_count ?? base.toolCount,
    toolsets: payload.toolsets ?? base.toolsets,
  };
}

export function upsertSubagent(
  items: SubagentProgress[],
  payload: SubagentEventPayload,
  patch: (current: SubagentProgress) => Partial<SubagentProgress>,
  opts: { createIfMissing?: boolean } = { createIfMissing: true },
): SubagentProgress[] {
  const id = subagentIdFromPayload(payload);
  const existing = items.find((item) => item.id === id);

  if (!existing && !opts.createIfMissing) {
    return items;
  }

  const base = existing ?? baseSubagent(payload, id);
  const next: SubagentProgress = {
    ...mergePayloadFields(base, payload),
    ...patch(base),
  };

  const subagents = existing
    ? items.map((item) => (item.id === id ? next : item))
    : [...items, next].sort((a, b) => a.depth - b.depth || a.index - b.index);

  return subagents;
}

export function applySubagentEvent(
  items: SubagentProgress[],
  type: string,
  payload: SubagentEventPayload,
): SubagentProgress[] {
  switch (type) {
    case "subagent.spawn_requested":
      return upsertSubagent(items, payload, (current) =>
        isTerminalSubagentStatus(current.status) ? {} : { status: "queued" },
      );
    case "subagent.start":
      return upsertSubagent(items, payload, (current) =>
        isTerminalSubagentStatus(current.status) ? {} : { status: "running" },
      );
    case "subagent.thinking": {
      const text = String(payload.text ?? "").trim();
      if (!text) return items;
      return upsertSubagent(
        items,
        payload,
        (current) => ({
          status: keepTerminalElseRunning(current.status),
          thinking: pushThinking(current.thinking, text),
        }),
        { createIfMissing: false },
      );
    }
    case "subagent.tool": {
      const line = formatToolCall(
        payload.tool_name ?? "delegate_task",
        payload.tool_preview ?? payload.text ?? "",
      );
      return upsertSubagent(
        items,
        payload,
        (current) => ({
          status: keepTerminalElseRunning(current.status),
          tools: pushTool(current.tools, line),
        }),
        { createIfMissing: false },
      );
    }
    case "subagent.progress": {
      const text = String(payload.text ?? "").trim();
      if (!text) return items;
      return upsertSubagent(
        items,
        payload,
        (current) => ({
          notes: pushNote(current.notes, text),
          status: keepTerminalElseRunning(current.status),
        }),
        { createIfMissing: false },
      );
    }
    case "subagent.complete":
      return upsertSubagent(
        items,
        payload,
        (current) => ({
          durationSeconds: payload.duration_seconds ?? current.durationSeconds,
          status: payload.status ?? "completed",
          summary: payload.summary || payload.text || current.summary,
        }),
        { createIfMissing: false },
      );
    default:
      return items;
  }
}

export function delegationIsActive(
  subagents: SubagentProgress[],
  busy: boolean,
): boolean {
  if (subagents.length === 0) return false;
  if (subagents.some((item) => isActiveSubagentStatus(item.status))) return true;
  return busy;
}
