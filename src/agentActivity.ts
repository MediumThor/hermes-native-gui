export type AgentActionKind = "thinking" | "tool" | "system" | "approval" | "continue" | "error";
export type AgentActionStatus = "running" | "complete" | "blocked" | "error" | "queued";

export type AgentAction = {
  kind: AgentActionKind;
  title: string;
  detail: string;
  status?: AgentActionStatus;
  inlineDiff?: string;
};

import {
  computeDiffStats,
  extractInlineDiff,
  extractPathFromDiff,
  formatDiffStats,
  isEditToolName,
} from "./diffUtils";

const PREFIX = "__HERMES_AGENT_ACTION__";

const TOOL_LABELS: Record<string, string> = {
  read_file: "Reading a file",
  write_file: "Writing a file",
  patch: "Editing files",
  search_files: "Searching the project",
  terminal: "Running a command",
  execute_code: "Running code",
  browser_navigate: "Opening a page",
  browser_snapshot: "Inspecting the page",
  browser_back: "Going back in the browser",
  browser_click: "Clicking the page",
  browser_type: "Typing into the page",
  browser_press: "Pressing a browser key",
  browser_scroll: "Scrolling the page",
  browser_console: "Checking browser console",
  browser_get_images: "Inspecting page images",
  browser_vision: "Inspecting the screen",
  computer_use: "Using the Mac desktop",
  delegate_task: "Delegating work",
  web_search: "Searching the web",
  clarify: "Asking for clarification",
};

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function compact(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function shortenPath(value: string): string {
  const text = value.trim();
  if (!text) return "";
  const match = text.match(/(?:[\w.-]+\/){1,}[^\s,)]+/);
  const candidate = match?.[0] ?? text;
  const homeIndex = candidate.indexOf("/hermes-native-gui/");
  if (homeIndex >= 0) return candidate.slice(homeIndex + "/hermes-native-gui/".length);
  const parts = candidate.split("/").filter(Boolean);
  if (parts.length > 3) return parts.slice(-3).join("/");
  return candidate.length > 180 ? `${candidate.slice(0, 177)}…` : candidate;
}

export function friendlyToolName(name: unknown): string {
  const key = compact(name);
  if (!key) return "Using a tool";
  return TOOL_LABELS[key] ?? titleCase(key);
}

export function actionFromGatewayEvent(
  type: string,
  data: Record<string, unknown>,
): AgentAction | null {
  if (type === "tool.start") {
    const rawDetail = compact(data.context ?? data.preview ?? data.command ?? data.path ?? "");
    return {
      kind: "tool",
      title: friendlyToolName(data.name),
      detail: shortenPath(rawDetail) || "Starting tool call…",
      status: "running",
    };
  }
  if (type === "tool.progress") {
    return {
      kind: "tool",
      title: friendlyToolName(data.name),
      detail: shortenPath(compact(data.preview ?? data.context ?? "Working…")),
      status: "running",
    };
  }
  if (type === "tool.complete") {
    const inlineDiff = extractInlineDiff(data);
    const name = compact(data.name);
    const isEdit = isEditToolName(name);
    if (!inlineDiff && !isEdit) return null;

    const contextPath = shortenPath(compact(data.context ?? data.path ?? ""));
    const summary = compact(data.summary ?? data.result ?? data.preview ?? "");
    const diffPath = inlineDiff ? extractPathFromDiff(inlineDiff) : "";
    const file = extractFilename(contextPath || summary || diffPath);
    const stats = inlineDiff
      ? formatDiffStats(computeDiffStats(inlineDiff))
      : extractDiffStats(summary);
    const detail = file
      ? stats
        ? `${file} ${stats}`
        : file
      : summary || "Edit complete";

    return {
      kind: "tool",
      title: friendlyToolName(name),
      detail,
      inlineDiff,
      status: data.error ? "error" : "complete",
    };
  }
  if (type === "status.update") {
    const detail = compact(data.text ?? data.message ?? "");
    if (!detail) return null;
    return {
      kind: "system",
      title: "System update",
      detail,
      status: "running",
    };
  }
  if (type === "thinking.delta" || type === "reasoning.delta") {
    const detail = compact(data.text ?? "");
    if (!detail) return null;
    return {
      kind: "thinking",
      title: "Thinking through the next step",
      detail,
      status: "running",
    };
  }
  if (type === "approval.request") {
    return {
      kind: "approval",
      title: "Waiting for approval",
      detail: compact(data.description ?? data.command ?? "Review the requested action."),
      status: "blocked",
    };
  }
  if (type === "clarify.request") {
    return {
      kind: "approval",
      title: "Waiting for your answer",
      detail: compact(data.question ?? "Hermes needs a bit more information."),
      status: "blocked",
    };
  }
  if (type === "sudo.request") {
    return {
      kind: "approval",
      title: "Waiting for admin permission",
      detail: "macOS needs your password before Hermes can continue.",
      status: "blocked",
    };
  }
  if (type === "secret.request") {
    const envVar = compact(data.env_var ?? data.envVar ?? "secret");
    return {
      kind: "approval",
      title: "Waiting for a secret",
      detail: envVar ? `${envVar} is needed before Hermes can continue.` : "A secret value is needed before Hermes can continue.",
      status: "blocked",
    };
  }
  return null;
}

export function describeQueuedPrompt(text: string): AgentAction {
  return {
    kind: "continue",
    title: "Follow-up queued",
    detail: compact(text),
    status: "queued",
  };
}

export function serializeAgentAction(action: AgentAction): string {
  return `${PREFIX}${JSON.stringify(action)}`;
}

export function parseAgentActionText(text: string): AgentAction | null {
  if (!text.startsWith(PREFIX)) return null;
  try {
    const parsed = JSON.parse(text.slice(PREFIX.length));
    if (!parsed || typeof parsed !== "object") return null;
    const title = compact(parsed.title);
    const detail = compact(parsed.detail);
    const kind = compact(parsed.kind) as AgentActionKind;
    if (!title || !kind) return null;
    const inlineDiff = typeof parsed.inlineDiff === "string" && parsed.inlineDiff.trim()
      ? parsed.inlineDiff.trim()
      : undefined;
    return {
      kind,
      title,
      detail,
      status: compact(parsed.status) as AgentActionStatus || undefined,
      inlineDiff,
    };
  } catch {
    return null;
  }
}

export function actionSummary(action: AgentAction): string {
  return action.detail ? `${action.title} — ${action.detail}` : action.title;
}

export type ActivityBoundary = "error" | "thinking" | "tool" | "status";

export function activityBoundaryForAction(action: AgentAction): ActivityBoundary {
  if (action.kind === "error") return "error";
  if (action.kind === "thinking") return "thinking";
  if (action.kind === "tool" || action.kind === "approval" || action.kind === "continue") return "tool";
  const detail = action.detail.toLowerCase();
  if (
    /aborting call|no response from provider|retrying in|non-streaming|timed out|timeout/.test(detail)
  ) {
    return "status";
  }
  return "status";
}

export function activityBoundaryLabel(boundary: ActivityBoundary): string {
  switch (boundary) {
    case "error":
      return "Errors";
    case "thinking":
      return "Thinking";
    case "tool":
      return "Tools";
    default:
      return "Status";
  }
}

function inferLegacyAction(text: string, status?: AgentActionStatus): AgentAction {
  const trimmed = text.trim();
  const bulletless = trimmed.replace(/^•\s*/, "").trim();
  const normalized = bulletless.replace(/^Error:\s*/i, "").trim();

  if (
    status === "error"
    || /^error:/i.test(bulletless)
    || /aborting call/i.test(bulletless)
    || /^⚠️/.test(bulletless)
  ) {
    return {
      kind: "error",
      title: "Error",
      detail: normalized,
      status: "error",
    };
  }

  if (/^retrying in/i.test(bulletless) || /^⌛/.test(bulletless)) {
    return {
      kind: "system",
      title: "Retrying",
      detail: bulletless,
      status: "running",
    };
  }

  if (/^\+user:/i.test(bulletless)) {
    return {
      kind: "continue",
      title: "Follow-up queued",
      detail: bulletless.replace(/^\+user:\s*/i, "").trim(),
      status: "queued",
    };
  }

  if (/^updating \d+ task/i.test(bulletless)) {
    return {
      kind: "system",
      title: "Task update",
      detail: bulletless,
      status: "running",
    };
  }

  if (/^\/Users\/|^file:\/\//.test(bulletless) || /\.(ts|tsx|js|mjs|py|json|md)\b/.test(bulletless)) {
    return {
      kind: "tool",
      title: "Reading a file",
      detail: shortenPath(bulletless),
      status: "running",
    };
  }

  if (/^(export |npm |node |git |cd |curl )/.test(bulletless) || /\bnpm run\b/.test(bulletless)) {
    return {
      kind: "tool",
      title: "Running a command",
      detail: bulletless.length > 160 ? `${bulletless.slice(0, 157)}…` : bulletless,
      status: "running",
    };
  }

  if (bulletless.includes(" — ")) {
    const [title, ...rest] = bulletless.split(" — ");
    const detail = rest.join(" — ").trim();
    if (/thinking/i.test(title)) {
      return { kind: "thinking", title, detail, status: "running" };
    }
    if (/reading|running|searching|writing|editing|opening|inspecting|delegating|using a tool/i.test(title)) {
      return { kind: "tool", title, detail, status: "running" };
    }
    if (/waiting for approval/i.test(title)) {
      return { kind: "approval", title, detail, status: "blocked" };
    }
    return { kind: "system", title, detail, status: "running" };
  }

  return {
    kind: "system",
    title: "System update",
    detail: bulletless,
    status: "running",
  };
}

/** Parse structured or legacy system transcript text into a normalized action row. */
export function actionFromSystemMessageText(
  text: string,
  status?: AgentActionStatus,
): AgentAction {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/^•\s*/, "").trim())
    .filter(Boolean);
  if (lines.length === 1) {
    const parsed = parseAgentActionText(lines[0]);
    if (parsed) return parsed;
    return inferLegacyAction(lines[0], status);
  }

  const parsedLines = lines.map((line) => parseAgentActionText(line) ?? inferLegacyAction(line, status));
  const detail = parsedLines
    .map((action) => actionSummary(action))
    .join("\n");
  const kind = parsedLines.some((action) => action.kind === "error")
    ? "error"
    : parsedLines.some((action) => action.kind === "tool")
      ? "tool"
      : "system";
  return {
    kind,
    title: "Activity",
    detail,
    status: parsedLines.some((action) => action.status === "error") ? "error" : status,
  };
}

export function actionsFromSystemMessages(
  messages: Array<{ text: string; status?: AgentActionStatus }>,
): AgentAction[] {
  const rows: AgentAction[] = [];
  for (const message of messages) {
    const chunks = message.text
      .split("\n")
      .map((line) => line.replace(/^•\s*/, "").trim())
      .filter(Boolean);
    if (chunks.length === 0) continue;
    for (const chunk of chunks) {
      const parsed = parseAgentActionText(chunk);
      rows.push(parsed ?? inferLegacyAction(chunk, message.status));
    }
  }
  return dedupeActivityRows(rows);
}

function actionRowKey(action: AgentAction): string {
  return `${action.kind}:${action.title}:${action.detail}`;
}

export function dedupeActivityRows(actions: AgentAction[]): AgentAction[] {
  const result: AgentAction[] = [];
  for (const action of actions) {
    const key = actionRowKey(action);
    const previous = result[result.length - 1];
    if (previous && actionRowKey(previous) === key) continue;
    result.push(action);
  }
  return result;
}

const GENERIC_ACTIVITY_DETAILS = new Set([
  "",
  "Working…",
  "Starting tool call…",
  "Activity",
]);

/** Hide noisy or duplicate rows from the chat transcript. */
export function isRenderableActivity(action: AgentAction): boolean {
  if (action.inlineDiff) return true;
  if (action.kind === "thinking") return false;
  const title = action.title.trim();
  const detail = action.detail.trim();
  if (!title && !detail) return false;
  if (title === "Activity" && !detail) return false;
  if ((title === "Activity" || title === "System update") && GENERIC_ACTIVITY_DETAILS.has(detail)) {
    return false;
  }
  if (detail === "Starting tool call…" && /read|tool/i.test(title)) return false;
  return true;
}

/** Collapse duplicate tool/status rows within one agent turn. */
export function consolidateTurnActivities(actions: AgentAction[]): AgentAction[] {
  const filtered = actions.filter(isRenderableActivity);
  const seen = new Set<string>();
  const merged: AgentAction[] = [];

  for (const action of dedupeActivityRows(filtered)) {
    const prev = merged[merged.length - 1];
    if (prev && prev.kind === action.kind && prev.title === action.title && action.kind === "tool") {
      merged[merged.length - 1] = action;
      continue;
    }
    const key = actionRowKey(action);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(action);
  }

  return merged;
}

export function shouldShowWorkingOnToolsBanner(actions: AgentAction[]): boolean {
  const hasTool = actions.some((action) => action.kind === "tool" || action.kind === "approval");
  const hasThinking = actions.some((action) => action.kind === "thinking");
  return hasTool && !hasThinking;
}

export type CursorActivityIcon =
  | "file"
  | "edit"
  | "terminal"
  | "search"
  | "thought"
  | "error"
  | "status"
  | "approval"
  | "delegate";

export type CursorActivityDisplay = {
  icon: CursorActivityIcon;
  label: string;
  detail?: string;
  status?: AgentActionStatus;
};

function extractFilename(value: string): string {
  const text = value.trim();
  if (!text) return "";
  const pathMatch = text.match(/(?:[\w.-]+\/)+[\w.-]+(?:\.\w+)?/);
  const candidate = pathMatch?.[0] ?? text;
  const parts = candidate.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? candidate;
}

function extractLineRange(value: string): string | null {
  const match = value.match(/(?:L|lines?\s*)(\d+)(?:\s*[-–]\s*(\d+))?/i);
  if (!match) return null;
  const start = match[1];
  const end = match[2];
  return end ? `L${start}-${end}` : `L${start}`;
}

function extractDiffStats(value: string): string | null {
  const match = value.match(/([+-]\d+(?:\s+[+-]\d+)?)/);
  return match?.[1]?.replace(/\s+/g, " ") ?? null;
}

/** Cursor-style single-line label for an activity row. */
export function cursorActivityDisplay(action: AgentAction, depth = 0): CursorActivityDisplay {
  const detail = action.detail.trim();
  const title = action.title.trim();
  const status = action.status;

  if (depth > 4) {
    const label = detail || title || "Working…";
    return {
      icon: "status",
      label: label.length > 100 ? `${label.slice(0, 97)}…` : label,
      detail: title && detail && title !== label ? detail : undefined,
      status,
    };
  }

  const displayLegacyDetail = (legacyDetail: string): CursorActivityDisplay => {
    const legacy = inferLegacyAction(legacyDetail, status);
    if (
      (legacy.title === "Activity" || legacy.title === "System update") &&
      legacy.detail.trim() === legacyDetail.trim()
    ) {
      const label = legacyDetail.length > 100 ? `${legacyDetail.slice(0, 97)}…` : legacyDetail;
      return { icon: "status", label: label || "Working…", status };
    }
    return cursorActivityDisplay(legacy, depth + 1);
  };

  if (action.kind === "error") {
    return { icon: "error", label: "Error", detail, status: "error" };
  }
  if (action.kind === "thinking") {
    const preview = detail.length > 140 ? `${detail.slice(0, 137)}…` : detail;
    return { icon: "thought", label: "Thought", detail: preview || undefined, status };
  }
  if (action.kind === "approval") {
    return { icon: "approval", label: title, detail: detail || undefined, status: status ?? "blocked" };
  }
  if (action.kind === "continue") {
    return { icon: "status", label: title, detail: detail || undefined, status };
  }
  if (/delegat/i.test(title)) {
    return { icon: "delegate", label: title, detail: detail || undefined, status };
  }
  if (/search/i.test(title)) {
    const target = extractFilename(detail) || detail;
    return { icon: "search", label: target ? `Searched ${target}` : title, detail: target ? undefined : detail, status };
  }
  if (/edit|writ|patch/i.test(title)) {
    const file = extractFilename(detail);
    const diff = extractDiffStats(detail);
    const label = file
      ? diff
        ? `Edited ${file} ${diff}`
        : `Edited ${file}`
      : title;
    return { icon: "edit", label, detail: file ? undefined : detail, status };
  }
  if (/read/i.test(title)) {
    const file = extractFilename(detail);
    const range = extractLineRange(detail);
    const label = file
      ? range
        ? `Read ${file} ${range}`
        : `Read ${file}`
      : title;
    return { icon: "file", label, detail: file ? undefined : detail, status };
  }
  if (/command|terminal|run/i.test(title)) {
    const command = detail.length > 100 ? `${detail.slice(0, 97)}…` : detail;
    return { icon: "terminal", label: "Ran command", detail: command || undefined, status };
  }
  if (action.kind === "tool") {
    const file = extractFilename(detail);
    if (file) {
      return { icon: "file", label: `Read ${file}`, detail: undefined, status };
    }
    if (title === "Activity" || title === "System update") {
      if (!detail) return { icon: "status", label: "Working…", status };
      return displayLegacyDetail(detail);
    }
    return { icon: "status", label: title, detail: detail || undefined, status };
  }
  if ((title === "Activity" || title === "System update") && detail) {
    return displayLegacyDetail(detail);
  }
  if ((title === "Activity" || title === "System update") && !detail) {
    return { icon: "status", label: "Working…", status };
  }
  return { icon: "status", label: title, detail: detail || undefined, status };
}
