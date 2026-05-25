import { ClipboardCopy, FileText, GitBranch, PackageOpen, Square } from "lucide-react-native";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { SubagentNode, SubagentProgress, SubagentStatus } from "../subagentTypes";
import { formatSummary, treeTotals } from "../subagentTree";
import {
  buildMissionTimeline,
  collectMissionArtifacts,
  type MissionSummary,
} from "../missionTimeline";
import { MiniBadge, SecondaryButton } from "./DashboardPrimitives";
import { ReasoningDropdown } from "./ReasoningDropdown";
import { SubagentTreeNode } from "./SubagentTreeNode";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";
import type { NativeThemeColors } from "../themes/types";

type Props = {
  tree: SubagentNode[];
  subagents: SubagentProgress[];
  missionSummary?: MissionSummary | null;
  status: string;
  busy: boolean;
  liveReasoning?: string;
  liveStreaming?: boolean;
  onStop: () => void;
  onViewChat: () => void;
  composer?: ReactNode;
};

const STATUS_LABEL: Record<MissionSummary["status"], string> = {
  completed: "Completed",
  running: "Running",
  interrupted: "Stopped",
  failed: "Failed",
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

function copyToClipboard(text: string) {
  const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : null;
  if (!clipboard || !text.trim()) return;
  void clipboard.writeText(text);
}

function statusLabel(status: MissionSummary["status"]) {
  return STATUS_LABEL[status] ?? status;
}

export function MissionControlView({
  tree,
  subagents,
  missionSummary,
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
  const timeline = useMemo(() => buildMissionTimeline(subagents), [subagents]);
  const visibleTimeline = useMemo(() => timeline.slice(-12), [timeline]);
  const artifacts = useMemo(() => collectMissionArtifacts(subagents), [subagents]);
  const failureSummaries = useMemo(
    () => subagents
      .filter((agent) => agent.status === "failed" || agent.status === "interrupted")
      .map((agent) => (agent.goal || agent.id) + ": " + (agent.summary || agent.status)),
    [subagents],
  );
  const artifactCopyText = useMemo(() => [
    "Files read:",
    ...(artifacts.filesRead.length ? artifacts.filesRead : ["None"]),
    "",
    "Files written:",
    ...(artifacts.filesWritten.length ? artifacts.filesWritten : ["None"]),
    "",
    "Tools:",
    ...(artifacts.tools.length ? artifacts.tools : ["None"]),
    "",
    "Summaries:",
    ...(artifacts.summaries.length ? artifacts.summaries : ["None"]),
    "",
    "Failures:",
    ...(failureSummaries.length ? failureSummaries : ["None"]),
  ].join("\n"), [artifacts, failureSummaries]);

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

        {missionSummary ? (
          <View style={styles.resultCard}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleRow}>
                <FileText color={colors.success} size={17} />
                <Text selectable style={styles.sectionTitle}>Mission summary</Text>
              </View>
              <MiniBadge label={statusLabel(missionSummary.status)} active={missionSummary.status === "running"} />
            </View>
            <Text selectable style={styles.resultStats}>
              {missionSummary.agentCount} agents · {missionSummary.toolCount} tools · {missionSummary.filesTouched} files touched
            </Text>
            <Text selectable style={styles.summaryText}>{missionSummary.summaryText}</Text>
            <View style={styles.actionRow}>
              <Pressable
                style={styles.copyButton}
                onPress={() => copyToClipboard(missionSummary.summaryText)}
                accessibilityRole="button"
                accessibilityLabel="Copy mission summary"
              >
                <ClipboardCopy color={colors.midground} size={14} />
                <Text style={styles.copyText}>Copy summary</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {subagents.length > 0 ? (
          <View style={styles.artifactCard}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleRow}>
                <PackageOpen color={colors.success} size={17} />
                <Text selectable style={styles.sectionTitle}>Artifacts</Text>
              </View>
              <View style={styles.actionRow}>
                <Text selectable style={styles.resultStats}>
                  {artifacts.failureCount} failures · {artifacts.summaries.length} summaries
                </Text>
                <Pressable
                  style={styles.copyButton}
                  onPress={() => copyToClipboard(artifactCopyText)}
                  accessibilityRole="button"
                  accessibilityLabel="Copy artifact inventory"
                >
                  <ClipboardCopy color={colors.midground} size={14} />
                  <Text style={styles.copyText}>Copy artifacts</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.artifactGrid}>
              <View style={styles.artifactColumn}>
                <Text selectable style={styles.detailLabel}>Files read</Text>
                {(artifacts.filesRead.length ? artifacts.filesRead : ["None yet"]).slice(0, 8).map((file) => (
                  <Text key={`read-${file}`} selectable style={styles.toolLine}>{file}</Text>
                ))}
              </View>
              <View style={styles.artifactColumn}>
                <Text selectable style={styles.detailLabel}>Files written</Text>
                {(artifacts.filesWritten.length ? artifacts.filesWritten : ["None yet"]).slice(0, 8).map((file) => (
                  <Text key={`written-${file}`} selectable style={styles.toolLine}>{file}</Text>
                ))}
              </View>
              <View style={styles.artifactColumn}>
                <Text selectable style={styles.detailLabel}>Tools</Text>
                {(artifacts.tools.length ? artifacts.tools : ["None yet"]).slice(0, 8).map((tool) => (
                  <Text key={"tool-" + tool} selectable style={styles.toolLine}>{tool}</Text>
                ))}
              </View>
              <View style={styles.artifactColumn}>
                <Text selectable style={styles.detailLabel}>Summaries</Text>
                {(artifacts.summaries.length ? artifacts.summaries : ["None yet"]).slice(0, 4).map((summary, index) => (
                  <Text key={"summary-" + index} selectable style={styles.detailText} numberOfLines={3}>{summary}</Text>
                ))}
              </View>
              <View style={styles.artifactColumn}>
                <Text selectable style={styles.detailLabel}>Failures</Text>
                {(failureSummaries.length ? failureSummaries : ["None yet"]).slice(0, 4).map((failure, index) => (
                  <Text key={"failure-" + index} selectable style={styles.detailText} numberOfLines={3}>{failure}</Text>
                ))}
              </View>
            </View>
          </View>
        ) : null}

        {timeline.length > 0 ? (
          <View style={styles.timelineCard}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleRow}>
                <GitBranch color={colors.success} size={17} />
                <Text selectable style={styles.sectionTitle}>Timeline</Text>
              </View>
              <Text selectable style={styles.resultStats}>
                {visibleTimeline.length} of {timeline.length} events
              </Text>
            </View>
            {visibleTimeline.map((entry) => (
              <View key={entry.id} style={styles.timelineItem}>
                <View style={[styles.statusDot, { backgroundColor: statusColorFor(colors, entry.status) }]} />
                <View style={styles.timelineText}>
                  <Text selectable style={styles.timelineTitle}>{entry.title}</Text>
                  <Text selectable style={styles.detailText} numberOfLines={3}>{entry.detail}</Text>
                </View>
              </View>
            ))}
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
  resultCard: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 16,
    backgroundColor: colors.accent,
    padding: 16,
    gap: 10,
  },
  artifactCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
    padding: 16,
    gap: 12,
  },
  timelineCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
    padding: 16,
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { color: colors.midground, fontSize: 15, fontWeight: "900" },
  resultStats: { color: colors.midgroundFaint, fontSize: 12, lineHeight: 18 },
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
  artifactGrid: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  artifactColumn: { flex: 1, minWidth: 220, gap: 6 },
  timelineItem: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  timelineText: { flex: 1, minWidth: 0, gap: 3 },
  timelineTitle: { color: colors.midground, fontSize: 13, fontWeight: "800" },
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

