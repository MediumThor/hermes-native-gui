import type { SessionRuntimeState, SessionSummary } from "./types";

export type DedupedSessionSummary = SessionSummary & {
  /** How many near-duplicate resume forks were collapsed into this card. */
  duplicateCount?: number;
};

function normalizePreview(preview: string): string {
  return preview.trim().replace(/\s+/g, " ").toLowerCase();
}

function looksLikeGeneratedSessionTitle(title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed) return true;
  return /^\d{8}_\d{6}_[a-f0-9]+$/i.test(trimmed) || /^session_/i.test(trimmed);
}

/** Group resume forks that share the same visible conversation. */
export function sessionConversationFingerprint(session: SessionSummary): string {
  const title = session.title.trim();
  const preview = normalizePreview(session.preview);
  if (title && !looksLikeGeneratedSessionTitle(title)) {
    return `title:${title.toLowerCase()}`;
  }
  if (preview.length >= 24) {
    return `preview:${preview.slice(0, 160)}`;
  }
  return `id:${session.id}`;
}

export function pickCanonicalSessionSummary(
  group: SessionSummary[],
  resolveSessionRuntime?: (sessionId: string) => SessionRuntimeState | undefined,
): SessionSummary {
  return [...group].sort((a, b) => {
    const aRunning = resolveSessionRuntime?.(a.id)?.running ? 1 : 0;
    const bRunning = resolveSessionRuntime?.(b.id)?.running ? 1 : 0;
    if (aRunning !== bRunning) return bRunning - aRunning;
    if (a.message_count !== b.message_count) return b.message_count - a.message_count;
    return (b.last_response_at ?? b.started_at ?? 0) - (a.last_response_at ?? a.started_at ?? 0);
  })[0]!;
}

export function dedupeSessionList(
  sessions: SessionSummary[],
  resolveSessionRuntime?: (sessionId: string) => SessionRuntimeState | undefined,
): DedupedSessionSummary[] {
  const groups = new Map<string, SessionSummary[]>();
  for (const session of sessions) {
    const key = sessionConversationFingerprint(session);
    const bucket = groups.get(key) ?? [];
    bucket.push(session);
    groups.set(key, bucket);
  }

  return [...groups.values()].map((group) => {
    const canonical = pickCanonicalSessionSummary(group, resolveSessionRuntime);
    return {
      ...canonical,
      duplicateCount: group.length > 1 ? group.length : undefined,
    };
  });
}
