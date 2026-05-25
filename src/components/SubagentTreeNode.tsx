import { ChevronDown, ChevronRight, ClipboardCopy } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { SubagentNode, SubagentProgress, SubagentStatus } from "../subagentTypes";
import { fmtDuration } from "../subagentTree";
import { isActiveSubagentStatus } from "../subagentReducer";
import { MiniBadge } from "./DashboardPrimitives";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";
import type { NativeThemeColors } from "../themes/types";

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

function copyToClipboard(text: string) {
  const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : null;
  if (!clipboard || !text.trim()) return;
  void clipboard.writeText(text);
}

function latest(items: readonly string[]): string {
  return items.length > 0 ? items[items.length - 1] : "";
}

type Props = {
  node: SubagentNode;
  depth: number;
  nowMs: number;
  defaultExpanded?: boolean;
  variant?: "full" | "compact";
  showConnector?: boolean;
};

export function SubagentTreeNode({
  node,
  depth,
  nowMs,
  defaultExpanded,
  variant = "full",
  showConnector = false,
}: Props) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors, variant), [colors, variant]);
  const compact = variant === "compact";
  const [expanded, setExpanded] = useState(defaultExpanded ?? depth === 0);
  const item = node.item;
  const elapsed = elapsedSeconds(item, nowMs);
  const hasDetails =
    !compact &&
    (item.thinking.length > 0 ||
      item.tools.length > 0 ||
      item.notes.length > 0 ||
      Boolean(item.summary) ||
      node.children.length > 0);
  const hasChildren = node.children.length > 0;
  const canExpand = hasDetails || (compact && hasChildren);
  const latestTool = latest(item.tools);
  const latestProgress = latest(item.notes);
  const actionButtons = !compact
    ? [
        { key: "goal", label: "Copy goal", value: item.goal || "Subagent" },
        { key: "summary", label: "Copy summary", value: item.summary ?? "" },
        { key: "tool", label: "Copy latest tool", value: latestTool },
        { key: "progress", label: "Copy latest progress", value: latestProgress },
      ].filter((action) => action.value.trim())
    : [];

  return (
    <View style={[styles.nodeWrap, showConnector && depth === 0 && styles.nodeWrapConnected]}>
      {showConnector && depth === 0 ? <View style={styles.topConnector} /> : null}
      <View style={[styles.nodeBlock, depth > 0 && styles.nodeNested]}>
        <Pressable
          style={styles.nodeHeader}
          onPress={() => canExpand && setExpanded((open) => !open)}
          disabled={!canExpand}
        >
          <View style={styles.nodeHeaderLeft}>
            {canExpand ? (
              expanded ? (
                <ChevronDown color={colors.success} size={compact ? 14 : 16} />
              ) : (
                <ChevronRight color={colors.success} size={compact ? 14 : 16} />
              )
            ) : (
              <View style={styles.nodeSpacer} />
            )}
            <View style={[styles.statusDot, { backgroundColor: statusColorFor(colors, item.status) }]} />
            <View style={styles.nodeTextWrap}>
              <Text selectable style={styles.nodeGoal} numberOfLines={expanded ? undefined : compact ? 2 : 2}>
                {item.goal || "Subagent"}
              </Text>
              <Text selectable style={styles.nodeMeta}>
                {STATUS_LABEL[item.status]}
                {!compact && item.model ? ` · ${item.model}` : ""}
                {elapsed != null ? ` · ${fmtDuration(elapsed)}` : ""}
                {node.aggregate.totalTools > 0 ? ` · ${node.aggregate.totalTools} tools` : ""}
                {hasChildren ? ` · ${node.children.length} child${node.children.length === 1 ? "" : "ren"}` : ""}
              </Text>
            </View>
          </View>
          {node.aggregate.activeCount > 0 ? (
            <MiniBadge label={`${node.aggregate.activeCount} active`} active />
          ) : null}
        </Pressable>

        {expanded && !compact ? (
          <View style={styles.nodeBody}>
            {actionButtons.length > 0 ? (
              <View style={styles.actionRow}>
                {actionButtons.map((action) => (
                  <Pressable
                    key={item.id + "-" + action.key}
                    style={styles.copyButton}
                    onPress={() => copyToClipboard(action.value)}
                    accessibilityRole="button"
                    accessibilityLabel={action.label}
                  >
                    <ClipboardCopy color={colors.midground} size={13} />
                    <Text style={styles.copyText}>{action.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

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

            {hasChildren ? (
              <View style={styles.childTree}>
                {node.children.map((child) => (
                  <SubagentTreeNode
                    key={child.item.id}
                    node={child}
                    depth={depth + 1}
                    nowMs={nowMs}
                    defaultExpanded={child.aggregate.activeCount > 0}
                    variant={variant}
                  />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {expanded && compact && hasChildren ? (
          <View style={styles.compactChildTree}>
            {node.children.map((child) => (
              <SubagentTreeNode
                key={child.item.id}
                node={child}
                depth={depth + 1}
                nowMs={nowMs}
                defaultExpanded={child.aggregate.activeCount > 0}
                variant={variant}
              />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function createStyles(colors: NativeThemeColors, variant: "full" | "compact") {
  const compact = variant === "compact";
  return StyleSheet.create({
    nodeWrap: { position: "relative" },
    nodeWrapConnected: { marginLeft: 18 },
    topConnector: {
      position: "absolute",
      left: -18,
      top: 0,
      bottom: "50%",
      width: 18,
      borderLeftWidth: 2,
      borderBottomWidth: 2,
      borderColor: colors.highlight,
      borderBottomLeftRadius: 8,
    },
    nodeBlock: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: compact ? 12 : 16,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    nodeNested: { marginLeft: compact ? 14 : 16, marginTop: compact ? 8 : 10 },
    nodeHeader: {
      paddingHorizontal: compact ? 12 : 16,
      paddingVertical: compact ? 10 : 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    nodeHeaderLeft: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: compact ? 8 : 10, minWidth: 0 },
    nodeSpacer: { width: compact ? 14 : 16 },
    statusDot: { width: compact ? 8 : 10, height: compact ? 8 : 10, borderRadius: 999, marginTop: 5 },
    nodeTextWrap: { flex: 1, minWidth: 0, gap: 4 },
    nodeGoal: {
      color: colors.midground,
      fontSize: compact ? 13 : 15,
      fontWeight: "800",
      lineHeight: compact ? 18 : 21,
    },
    nodeMeta: { color: colors.midgroundFaint, fontSize: compact ? 11 : 12, lineHeight: compact ? 16 : 18 },
    nodeBody: {
      borderTopWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingBottom: 16,
      paddingTop: 12,
      gap: 12,
    },
    actionRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
    copyButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    copyText: { color: colors.midground, fontSize: 12, fontWeight: "800" },
    detailSection: { gap: 6 },
    detailLabel: {
      color: colors.success,
      fontSize: 11,
      fontWeight: "900",
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    detailText: { color: colors.midgroundFaint, fontSize: 12, lineHeight: 18 },
    toolLine: {
      color: colors.midgroundFaint,
      fontSize: 12,
      lineHeight: 18,
      fontFamily: "Menlo, monospace",
    },
    summaryText: { color: colors.midground, fontSize: 13, lineHeight: 20 },
    childTree: {
      gap: 10,
      marginTop: 4,
      marginLeft: 14,
      paddingLeft: 12,
      borderLeftWidth: 2,
      borderLeftColor: colors.highlight,
    },
    compactChildTree: {
      marginLeft: 14,
      paddingLeft: 12,
      borderLeftWidth: 2,
      borderLeftColor: colors.highlight,
      borderTopWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 8,
      gap: 8,
    },
  });
}
