import type { SubagentAggregate, SubagentNode, SubagentProgress } from "./subagentTypes";
import { isActiveSubagentStatus } from "./subagentReducer";

const ROOT_KEY = "__root__";

function aggregate(item: SubagentProgress, children: readonly SubagentNode[]): SubagentAggregate {
  let totalTools = item.toolCount ?? 0;
  let totalDuration = item.durationSeconds ?? 0;
  let descendantCount = 0;
  let activeCount = isActiveSubagentStatus(item.status) ? 1 : 0;
  let maxDepthFromHere = 0;
  let inputTokens = item.inputTokens ?? 0;
  let outputTokens = item.outputTokens ?? 0;
  let costUsd = item.costUsd ?? 0;
  let filesTouched = (item.filesRead?.length ?? 0) + (item.filesWritten?.length ?? 0);

  for (const child of children) {
    totalTools += child.aggregate.totalTools;
    totalDuration += child.aggregate.totalDuration;
    descendantCount += child.aggregate.descendantCount + 1;
    activeCount += child.aggregate.activeCount;
    maxDepthFromHere = Math.max(maxDepthFromHere, child.aggregate.maxDepthFromHere + 1);
    inputTokens += child.aggregate.inputTokens;
    outputTokens += child.aggregate.outputTokens;
    costUsd += child.aggregate.costUsd;
    filesTouched += child.aggregate.filesTouched;
  }

  const hotness = totalDuration > 0 ? totalTools / totalDuration : 0;

  return {
    activeCount,
    costUsd,
    descendantCount,
    filesTouched,
    hotness,
    inputTokens,
    maxDepthFromHere,
    outputTokens,
    totalDuration,
    totalTools,
  };
}

export function buildSubagentTree(items: readonly SubagentProgress[]): SubagentNode[] {
  if (!items.length) return [];

  const byParent = new Map<string, SubagentProgress[]>();
  const known = new Set(items.map((item) => item.id));

  for (const item of items) {
    const parentKey = item.parentId && known.has(item.parentId) ? item.parentId : ROOT_KEY;
    const bucket = byParent.get(parentKey) ?? [];
    bucket.push(item);
    byParent.set(parentKey, bucket);
  }

  for (const bucket of byParent.values()) {
    bucket.sort((a, b) => a.depth - b.depth || a.index - b.index);
  }

  const build = (item: SubagentProgress): SubagentNode => {
    const kids = byParent.get(item.id) ?? [];
    const children = kids.map(build);
    return { item, children, aggregate: aggregate(item, children) };
  };

  return (byParent.get(ROOT_KEY) ?? []).map(build);
}

export function treeTotals(tree: readonly SubagentNode[]): SubagentAggregate {
  let totalTools = 0;
  let totalDuration = 0;
  let descendantCount = 0;
  let activeCount = 0;
  let maxDepthFromHere = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let filesTouched = 0;

  for (const node of tree) {
    totalTools += node.aggregate.totalTools;
    totalDuration += node.aggregate.totalDuration;
    descendantCount += node.aggregate.descendantCount + 1;
    activeCount += node.aggregate.activeCount;
    maxDepthFromHere = Math.max(maxDepthFromHere, node.aggregate.maxDepthFromHere + 1);
    inputTokens += node.aggregate.inputTokens;
    outputTokens += node.aggregate.outputTokens;
    costUsd += node.aggregate.costUsd;
    filesTouched += node.aggregate.filesTouched;
  }

  const hotness = totalDuration > 0 ? totalTools / totalDuration : 0;

  return {
    activeCount,
    costUsd,
    descendantCount,
    filesTouched,
    hotness,
    inputTokens,
    maxDepthFromHere,
    outputTokens,
    totalDuration,
    totalTools,
  };
}

export function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds - minutes * 60);
  return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
}

export function formatSummary(totals: SubagentAggregate): string {
  const pieces = [`depth ${Math.max(0, totals.maxDepthFromHere)}`];
  pieces.push(`${totals.descendantCount} agent${totals.descendantCount === 1 ? "" : "s"}`);

  if (totals.totalTools > 0) {
    pieces.push(`${totals.totalTools} tool${totals.totalTools === 1 ? "" : "s"}`);
  }

  if (totals.totalDuration > 0) {
    pieces.push(fmtDuration(totals.totalDuration));
  }

  if (totals.activeCount > 0) {
    pieces.push(`${totals.activeCount} active`);
  }

  return pieces.join(" · ");
}

export function flattenSubagentTree(nodes: readonly SubagentNode[]): SubagentProgress[] {
  const items: SubagentProgress[] = [];
  const walk = (list: readonly SubagentNode[]) => {
    for (const node of list) {
      items.push(node.item);
      walk(node.children);
    }
  };
  walk(nodes);
  return items;
}
