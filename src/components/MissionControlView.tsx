import { ChevronDown, ChevronRight, Square } from "lucide-react-native";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { SubagentNode, SubagentProgress, SubagentStatus } from "../subagentTypes";
import { fmtDuration, formatSummary, treeTotals } from "../subagentTree";
import { isActiveSubagentStatus } from "../subagentReducer";
import { MiniBadge, SecondaryButton } from "./DashboardPrimitives";
import { ReasoningDropdown } from "./ReasoningDropdown";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";
import type { NativeThemeColors } from "../themes/types";

type Props = {
  tree: SubagentNode[];
  status: string;
  busy: boolean;
  liveReasoning?: string;
  liveStreaming?: boolean;
  onStop: () => void;
  onViewChat: () => void;
  composer?: ReactNode;
};

const STATUS_LABEL: Record<SubagentStatus, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Done",
  failed: "Failed",
  interrupted: "Stopped",
};

function statusColorFor(colors: NativeThemeColors, status: SubagentStatus): string {
  const map: Record<SubagentStatus, string> = {
    queued: colors.midgroundFaint,
    running: colors.success,
    completed: colors.success,
    failed: colors.destructiveText,
    interrupted: colors.warning,
  };
  return map[status];
}

function elapsedSeconds(item: SubagentProgress, nowMs: number): number | null {
  if (item.durationSeconds != null) return item.durationSeconds;
  if (item.startedAt != null && isActiveSubagentStatus(item.status)) {
    return Math.max(0, (nowMs - item.startedAt) / 1000);
  }
  return null;
}

function SubagentTreeNode({
  node,
  depth,
  nowMs,
  defaultExpanded,
}: {
  node: SubagentNode;
  depth: number;
  nowMs: number;
  defaultExpanded?: boolean;
}) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(defaultExpanded ?? depth === 0);
  const item = node.item;
  const elapsed = elapsedSeconds(item, nowMs);
  const hasDetails =
    item.thinking.length > 0 ||
    item.tools.length > 0 ||
    item.notes.length > 0 ||
    Boolean(item.summary) ||
    node.children.length > 0;

  return (
    <View style={[styles.nodeBlock, depth > 0 && styles.nodeNested]}>
      <Pressable
        style={styles.nodeHeader}
        onPress={() => hasDetails && setExpanded((open) => !open)}
        disabled={!hasDetails}
      >
        <View style={styles.nodeHeaderLeft}>
          {hasDetails ? (
            expanded ? (
              <ChevronDown color={colors.success} size={16} />
            ) : (
              <ChevronRight color={colors.success} size={16} />
            )
          ) : (
            <View style={styles.nodeSpacer} />
          )}
          <View style={[styles.statusDot, { backgroundColor: statusColorFor(colors, item.status) }]} />
          <View style={styles.nodeTextWrap}>
            <Text selectable style={styles.nodeGoal} numberOfLines={expanded ? undefined : 2}>
              {item.goal || "Subagent"}
            </Text>
            <Text selectable style={styles.nodeMeta}>
              {STATUS_LABEL[item.status]}
              {item.model ? ` · ${item.model}` : ""}
              {elapsed != null ? ` · ${fmtDuration(elapsed)}` : ""}
              {node.aggregate.totalTools > 0 ? ` · ${node.aggregate.totalTools} tools` : ""}
              {node.children.length > 0 ? ` · ${node.children.length} child${node.children.length === 1 ? "" : "ren"}` : ""}
            </Text>
          </View>
        </View>
        {node.aggregate.activeCount > 0 ? (
          <MiniBadge label={`${node.aggregate.activeCount} active`} active />
        ) : null}
      </Pressable>

      {expanded ? (
        <View style={styles.nodeBody}>
          {item.thinking.length > 0 ? (
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Thinking</Text>
              {item.thinking.slice(-6).map((line, index) => (
                <Text key={`${item.id}-thinking-${index}`} selectable style={styles.detailText}>
                  {line}
                </Text>
              ))}
            </View>
          ) : null}

          {item.tools.length > 0 ? (
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Tools</Text>
              {item.tools.slice(-8).map((line, index) => (
                <Text key={`${item.id}-tool-${index}`} selectable style={styles.toolLine}>
                  {line}
                </Text>
              ))}
            </View>
          ) : null}

          {item.notes.length > 0 ? (
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Progress</Text>
              {item.notes.slice(-4).map((line, index) => (
                <Text key={`${item.id}-note-${index}`} selectable style={styles.detailText}>
                  {line}
                </Text>
              ))}
            </View>
          ) : null}

          {item.summary ? (
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Summary</Text>
              <Text selectable style={styles.summaryText}>{item.summary}</Text>
            </View>
          ) : null}

          {node.children.length > 0 ? (
            <View style={styles.childTree}>
              {node.children.map((child) => (
                <SubagentTreeNode
                  key={child.item.id}
                  node={child}
                  depth={depth + 1}
                  nowMs={nowMs}
                  defaultExpanded={child.aggregate.activeCount > 0}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function MissionControlView({
  tree,
  status,
  busy,
  liveReasoning,
  liveStreaming = false,
  onStop,
  onViewChat,
  composer,
}: Props) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [nowMs, setNowMs] = useState(Date.now());
  const totals = useMemo(() => treeTotals(tree), [tree]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <View style={styles.toolbarText}>
          <Text selectable style={styles.title}>Mission Control</Text>
          <Text selectable style={styles.subtitle}>
            {formatSummary(totals)}
            {status ? ` · ${status}` : ""}
          </Text>
        </View>
        <View style={styles.toolbarActions}>
          <SecondaryButton label="View chat" onPress={onViewChat} />
          {busy ? (
            <Pressable style={styles.stopButton} onPress={onStop}>
              <Square color={colors.destructiveText} size={16} />
              <Text style={styles.stopText}>Stop</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {busy || liveReasoning ? (
          <View style={styles.leadAgentCard}>
            <Text style={styles.leadAgentLabel}>Lead agent</Text>
            <ReasoningDropdown
              title="Assistant"
              streaming={liveStreaming || busy}
              reasoning={liveReasoning}
              placeholder="The lead agent's reasoning stream will appear here while it delegates work."
              defaultOpen={Boolean(liveReasoning?.trim())}
            />
          </View>
        ) : null}

        {tree.length === 0 ? (
          <View style={styles.emptyState}>
            <Text selectable style={styles.emptyTitle}>Waiting for delegation…</Text>
            <Text selectable style={styles.emptyText}>
              Subagents will appear here as Hermes delegates work. You can return to chat any time.
            </Text>
          </View>
        ) : (
          tree.map((node) => (
            <SubagentTreeNode
              key={node.item.id}
              node={node}
              depth={0}
              nowMs={nowMs}
              defaultExpanded={node.aggregate.activeCount > 0}
            />
          ))
        )}
      </ScrollView>

      {composer ? <View style={styles.composerSlot}>{composer}</View> : null}
    </View>
  );
}

function createStyles(colors: NativeThemeColors) {
  return StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  toolbar: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  toolbarText: { flex: 1, minWidth: 220, gap: 4 },
  toolbarActions: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  title: { color: colors.midground, fontSize: 22, fontWeight: "900" },
  subtitle: { color: colors.midgroundFaint, lineHeight: 20 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    gap: 12,
    maxWidth: 960,
    width: "100%",
    alignSelf: "center",
  },
  leadAgentCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
    padding: 16,
    gap: 8,
  },
  leadAgentLabel: {
    color: colors.success,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  nodeBlock: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
    overflow: "hidden",
  },
  nodeNested: { marginLeft: 16, marginTop: 10 },
  nodeHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  nodeHeaderLeft: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 10, minWidth: 0 },
  nodeSpacer: { width: 16 },
  statusDot: { width: 10, height: 10, borderRadius: 999, marginTop: 5 },
  nodeTextWrap: { flex: 1, minWidth: 0, gap: 4 },
  nodeGoal: { color: colors.midground, fontSize: 15, fontWeight: "800", lineHeight: 21 },
  nodeMeta: { color: colors.midgroundFaint, fontSize: 12, lineHeight: 18 },
  nodeBody: {
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 12,
    gap: 12,
  },
  detailSection: { gap: 6 },
  detailLabel: { color: colors.success, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.6 },
  detailText: { color: colors.midgroundFaint, fontSize: 12, lineHeight: 18 },
  toolLine: {
    color: colors.midgroundFaint,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Menlo, monospace",
  },
  summaryText: { color: colors.midground, fontSize: 13, lineHeight: 20 },
  childTree: { gap: 10, marginTop: 4 },
  emptyState: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 24,
    backgroundColor: colors.surfaceElevated,
    gap: 10,
  },
  emptyTitle: { color: colors.midground, fontSize: 18, fontWeight: "800" },
  emptyText: { color: colors.midgroundFaint, lineHeight: 21 },
  composerSlot: {
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stopButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.destructiveBorder,
    backgroundColor: colors.destructiveSurface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  stopText: { color: colors.destructiveText, fontWeight: "800" },
  });
}

