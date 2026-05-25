export type DiffStats = {
  added: number;
  removed: number;
};

export type DiffChunk = {
  path: string;
  diff: string;
  stats: DiffStats;
};

export function extractInlineDiff(data: Record<string, unknown>): string | undefined {
  for (const key of ["inline_diff", "inlineDiff", "diff", "patch"]) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function isEditToolName(name: unknown): boolean {
  const key = String(name ?? "").toLowerCase();
  return /edit|writ|patch|apply_patch|str_replace|create/.test(key);
}

export function computeDiffStats(diff: string): DiffStats {
  let added = 0;
  let removed = 0;
  for (const line of diff.replace(/\r\n/g, "\n").split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) continue;
    if (line.startsWith("+")) added += 1;
    else if (line.startsWith("-")) removed += 1;
  }
  return { added, removed };
}

export function formatDiffStats(stats: DiffStats): string {
  return `+${stats.added} -${stats.removed}`;
}

export function extractPathFromDiff(diff: string): string {
  const normalized = diff.replace(/\r\n/g, "\n");
  const bPath = normalized.match(/^\+\+\+ b\/(.+)$/m)?.[1];
  if (bPath) return bPath.trim();
  const aPath = normalized.match(/^--- a\/(.+)$/m)?.[1];
  if (aPath) return aPath.trim();
  const gitPath = normalized.match(/^diff --git a\/(.+?) b\//m)?.[1];
  if (gitPath) return gitPath.trim();
  return "";
}

export function basenameFromPath(path: string): string {
  const text = path.trim();
  if (!text) return "";
  const parts = text.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? text;
}

export function fileExtensionBadge(filename: string): string {
  const match = filename.match(/\.([a-z0-9]+)$/i);
  return match?.[1]?.toUpperCase().slice(0, 4) ?? "FILE";
}

export function isUnifiedDiff(text: string): boolean {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return false;
  return (
    /^diff --git /m.test(normalized)
    || /^--- /m.test(normalized)
    || /^@@ /m.test(normalized)
    || (/^[+-][^+-]/m.test(normalized) && normalized.includes("\n"))
  );
}

function parseDiffChunk(chunk: string): DiffChunk {
  const path = extractPathFromDiff(chunk);
  return {
    path: basenameFromPath(path),
    diff: chunk.trim(),
    stats: computeDiffStats(chunk),
  };
}

export function splitUnifiedDiff(text: string): DiffChunk[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const gitParts = normalized.split(/^diff --git /m).filter(Boolean);
  if (gitParts.length > 1) {
    return gitParts.map((part) => parseDiffChunk(`diff --git ${part}`));
  }

  return [parseDiffChunk(normalized)];
}

export function diffLineKind(line: string): "add" | "remove" | "hunk" | "context" {
  if (line.startsWith("+") && !line.startsWith("+++")) return "add";
  if (line.startsWith("-") && !line.startsWith("---")) return "remove";
  if (line.startsWith("@@")) return "hunk";
  return "context";
}
