import type { MissionSummary } from "./missionTimeline";

const STORAGE_KEY = "hermes-native-gui:mission-summaries:v1";

export type MissionSummaryMap = Record<string, MissionSummary>;

export function loadMissionSummaries(): MissionSummaryMap {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as MissionSummaryMap;
  } catch {
    return {};
  }
}

export function saveMissionSummaries(summaries: MissionSummaryMap): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(summaries));
  } catch {
    // Ignore quota/security failures; mission summaries are a convenience cache.
  }
}

export function upsertMissionSummary(
  summaries: MissionSummaryMap,
  summary: MissionSummary,
  aliases: readonly (string | null | undefined)[] = [],
): MissionSummaryMap {
  const next = { ...summaries, [summary.sessionId]: summary };
  for (const alias of aliases) {
    if (!alias) continue;
    next[alias] = { ...summary, sessionId: alias };
  }
  return next;
}
