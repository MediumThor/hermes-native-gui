import type { MissionSummary } from "./missionTimeline";
import {
  firstUserMessageTitle,
  purposeTitleFromPrompt,
  resolveSessionPurposeTitle,
} from "./sessionPurposeTitles";
import type { SubagentProgress } from "./subagentTypes";
import type { ChatMessage } from "./types";

const GENERIC_ACTIVITIES = new Set([
  "",
  "Working…",
  "Working...",
  "Ready",
  "Replying…",
  "Thinking…",
  "Starting tool call…",
]);

export type SessionLabelContext = {
  transcript?: ChatMessage[];
  subagents?: SubagentProgress[];
  missionSummary?: MissionSummary | null;
  runtimeActivity?: string;
};

/** True when a fleet/session label is a placeholder, not a real title. */
export function isGenericSessionLabel(label: string, sessionId = ""): boolean {
  const trimmed = label.trim();
  if (!trimmed) return true;
  if (trimmed === "Current chat" || trimmed === "Untitled") return true;
  if (/^Running · /i.test(trimmed)) return true;
  if (/^Agent · /i.test(trimmed)) return true;
  if (sessionId && trimmed === `Agent · ${sessionId.slice(0, 8)}`) return true;
  return false;
}

export function inferTitleFromSessionContext(context: SessionLabelContext): string {
  const summary = context.missionSummary?.summaryText?.trim();
  if (summary) {
    const fromSummary = purposeTitleFromPrompt(summary, 60);
    if (fromSummary) return fromSummary;
  }

  const subagentGoal = context.subagents?.find((item) => item.goal?.trim())?.goal?.trim();
  if (subagentGoal) {
    const fromGoal = purposeTitleFromPrompt(subagentGoal);
    if (fromGoal) return fromGoal;
  }

  if (context.transcript?.length) {
    const fromTranscript = firstUserMessageTitle(context.transcript);
    if (fromTranscript) return fromTranscript;
  }

  const activity = context.runtimeActivity?.trim() ?? "";
  if (activity && !GENERIC_ACTIVITIES.has(activity)) {
    const fromActivity = purposeTitleFromPrompt(activity, 60);
    if (fromActivity) return fromActivity;
  }

  return "";
}

export function resolveFleetSessionLabel(
  sessionId: string,
  options: {
    sessions: Array<{ id: string; title?: string }>;
    purposeTitles?: Record<string, string>;
    aliasIds?: string[];
    context?: SessionLabelContext;
  },
): string {
  const aliases = options.aliasIds ?? [];
  const serverTitle = options.sessions.find((session) =>
    session.id === sessionId || aliases.includes(session.id),
  )?.title;

  const fromStored = resolveSessionPurposeTitle(sessionId, {
    serverTitle,
    purposeTitles: options.purposeTitles,
    aliasIds: aliases,
  });

  if (!isGenericSessionLabel(fromStored, sessionId)) {
    return fromStored;
  }

  const inferred = options.context ? inferTitleFromSessionContext(options.context) : "";
  if (inferred) return inferred;

  if (fromStored) return fromStored;
  return `Agent · ${sessionId.slice(0, 8)}`;
}

export function shouldSyncSessionTitle(
  sessionId: string,
  options: {
    purposeTitles?: Record<string, string>;
    aliasIds?: string[];
    serverTitle?: string;
    context?: SessionLabelContext;
  },
): boolean {
  const label = resolveFleetSessionLabel(sessionId, {
    sessions: options.serverTitle ? [{ id: sessionId, title: options.serverTitle }] : [],
    purposeTitles: options.purposeTitles,
    aliasIds: options.aliasIds,
    context: options.context,
  });
  return isGenericSessionLabel(label, sessionId);
}

export function normalizeGatewaySessionTitle(value: unknown): string {
  const title = String(value ?? "").trim();
  if (!title || title === "Untitled") return "";
  if (/^Running · /i.test(title)) return "";
  return title;
}
