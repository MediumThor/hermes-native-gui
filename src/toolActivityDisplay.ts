import { friendlyToolName } from "./agentActivity";
import type { ToolActivity } from "./types";

function formatDuration(startedAt?: number, completedAt?: number): string | null {
  if (!startedAt || !completedAt || completedAt < startedAt) return null;
  const ms = completedAt - startedAt;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function compact(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function shortenPath(value: string): string {
  const text = value.trim();
  if (!text) return "";
  const match = text.match(/(?:[\w.-]+\/){1,}[^\s,)]+/);
  const candidate = match?.[0] ?? text;
  const projectIndex = candidate.indexOf("/hermes-native-gui/");
  if (projectIndex >= 0) return candidate.slice(projectIndex + "/hermes-native-gui/".length);
  const parts = candidate.split("/").filter(Boolean);
  if (parts.length > 3) return parts.slice(-3).join("/");
  return candidate.length > 220 ? `${candidate.slice(0, 217)}…` : candidate;
}

export function toolActivityDisplay(tool: ToolActivity): {
  title: string;
  statusText: string;
  preview: string;
} {
  const duration = formatDuration(tool.startedAt, tool.completedAt);
  const statusText = tool.status === "error"
    ? "Needs attention"
    : tool.status === "complete"
      ? duration ? `Done · ${duration}` : "Done"
      : "Running";

  const preview = shortenPath(compact(tool.preview ?? tool.summary ?? tool.result ?? tool.error ?? ""));
  return {
    title: friendlyToolName(tool.name),
    statusText,
    preview,
  };
}

export { formatDuration as formatToolActivityDuration };
