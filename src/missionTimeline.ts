import type { SubagentProgress, SubagentStatus } from "./subagentTypes";

export type MissionTimelineStage =
  | "delegating"
  | "running"
  | "thinking"
  | "tool"
  | "progress"
  | "completed";

export type MissionTimelineEntry = {
  id: string;
  agentId: string;
  stage: MissionTimelineStage;
  title: string;
  detail: string;
  status: SubagentStatus;
  at?: number;
};

export type MissionArtifacts = {
  filesRead: string[];
  filesWritten: string[];
  tools: string[];
  summaries: string[];
  failureCount: number;
  toolCount: number;
};

export type MissionSummary = {
  sessionId: string;
  title: string;
  status: "completed" | "failed" | "interrupted" | "running";
  completedAt: number;
  agentCount: number;
  toolCount: number;
  filesTouched: number;
  summaryText: string;
};

function unique(items: readonly string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function terminalStatus(status: SubagentStatus): boolean {
  return status === "completed" || status === "failed" || status === "interrupted";
}

export function allSubagentsTerminal(subagents: readonly SubagentProgress[]): boolean {
  return subagents.length > 0 && subagents.every((item) => terminalStatus(item.status));
}

export function joinSubagentSummaries(subagents: readonly SubagentProgress[]): string {
  return subagents.map((item) => item.summary?.trim() ?? "").filter(Boolean).join("\n\n");
}

function last(items: readonly string[]): string | undefined {
  return items.length > 0 ? items[items.length - 1] : undefined;
}

export function buildMissionTimeline(subagents: readonly SubagentProgress[]): MissionTimelineEntry[] {
  const entries: MissionTimelineEntry[] = [];
  const ordered = [...subagents].sort((a, b) =>
    (a.startedAt ?? 0) - (b.startedAt ?? 0) || a.depth - b.depth || a.index - b.index,
  );

  for (const item of ordered) {
    const label = item.goal || "Subagent";
    entries.push({
      id: `${item.id}:delegating`,
      agentId: item.id,
      stage: "delegating",
      title: `Delegating · ${label}`,
      detail: item.model ? `Assigned to ${item.model}` : "Task queued for a subagent.",
      status: item.status,
      at: item.startedAt,
    });

    if (item.status === "running" || item.status === "queued") {
      entries.push({
        id: `${item.id}:running`,
        agentId: item.id,
        stage: "running",
        title: `Running · ${label}`,
        detail: last(item.notes) ?? last(item.thinking) ?? "Subagent is working.",
        status: item.status,
        at: item.startedAt,
      });
    }

    item.thinking.slice(-3).forEach((line, index) => {
      entries.push({
        id: `${item.id}:thinking:${index}`,
        agentId: item.id,
        stage: "thinking",
        title: "Thinking",
        detail: line,
        status: item.status,
        at: item.startedAt,
      });
    });

    if (item.tools.length > 0) {
      entries.push({
        id: `${item.id}:tool`,
        agentId: item.id,
        stage: "tool",
        title: `Tool use · ${item.tools.length} call${item.tools.length === 1 ? "" : "s"}`,
        detail: item.tools.slice(-3).join("\n"),
        status: item.status,
        at: item.startedAt,
      });
    }

    item.notes.slice(-3).forEach((note, index) => {
      entries.push({
        id: `${item.id}:progress:${index}`,
        agentId: item.id,
        stage: "progress",
        title: "Progress",
        detail: note,
        status: item.status,
        at: item.startedAt,
      });
    });

    if (terminalStatus(item.status)) {
      entries.push({
        id: `${item.id}:completed`,
        agentId: item.id,
        stage: "completed",
        title: item.status === "completed" ? `Completed · ${label}` : `${item.status} · ${label}`,
        detail: item.summary || `${label} ${item.status}.`,
        status: item.status,
        at: item.startedAt != null && item.durationSeconds != null
          ? item.startedAt + item.durationSeconds * 1000
          : item.startedAt,
      });
    }
  }

  return entries;
}

export function collectMissionArtifacts(subagents: readonly SubagentProgress[]): MissionArtifacts {
  const filesRead = unique(subagents.flatMap((item) => item.filesRead ?? []));
  const filesWritten = unique(subagents.flatMap((item) => item.filesWritten ?? []));
  const tools = unique(subagents.flatMap((item) => item.tools));
  const summaries = subagents.map((item) => item.summary ?? "").filter(Boolean);
  const failureCount = subagents.filter((item) => item.status === "failed" || item.status === "interrupted").length;
  const toolCount = subagents.reduce((total, item) => total + Math.max(item.toolCount ?? 0, item.tools.length), 0);
  return { filesRead, filesWritten, tools, summaries, failureCount, toolCount };
}

export function createMissionSummary(
  sessionId: string,
  title: string,
  subagents: readonly SubagentProgress[],
  completedAt = Date.now(),
): MissionSummary {
  const artifacts = collectMissionArtifacts(subagents);
  const allTerminal = subagents.length > 0 && subagents.every((item) => terminalStatus(item.status));
  const status: MissionSummary["status"] = !allTerminal
    ? "running"
    : subagents.some((item) => item.status === "failed")
      ? "failed"
      : subagents.some((item) => item.status === "interrupted")
        ? "interrupted"
        : "completed";
  const filesTouched = unique([...artifacts.filesRead, ...artifacts.filesWritten]).length;
  const summaryText = artifacts.summaries.length > 0
    ? artifacts.summaries.join("\n\n")
    : `${subagents.length} subagent${subagents.length === 1 ? "" : "s"} ${status}.`;

  return {
    sessionId,
    title: title || sessionId.slice(0, 8),
    status,
    completedAt,
    agentCount: subagents.length,
    toolCount: artifacts.toolCount,
    filesTouched,
    summaryText,
  };
}
