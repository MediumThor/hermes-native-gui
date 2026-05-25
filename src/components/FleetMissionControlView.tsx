import { ClipboardCopy, GitBranch, LayoutGrid, MessageSquare, Square } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { AttentionRequest } from "../attentionInbox";
import type { FleetSessionCard, FleetSnapshot } from "../fleetMission";
import { summarizeFleetCard } from "../fleetMission";
import type { SessionSummary } from "../types";
import { AttentionInbox } from "./AttentionInbox";
import { FleetPromptComposer } from "./FleetPromptComposer";
import { MiniBadge, SecondaryButton } from "./DashboardPrimitives";
import { SubagentTreeNode } from "./SubagentTreeNode";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";
import type { NativeThemeColors } from "../themes/types";

type Props = {
  snapshot: FleetSnapshot;
  status: string;
  connected: boolean;
  attentionRequests: AttentionRequest[];
  sessions: SessionSummary[];
  activeSessionId: string | null;
  onSendPrompt: (targetId: string, text: string) => Promise<void>;
  onOpenChat: (sessionId: string) => void;
  onStopSession: (sessionId: string) => void;
  onRespondAttention: (requestId: string) => void;
  onOpenAttentionSession: (sessionId: string) => void;
  onOpenSessionMissionControl?: () => void;
};

async function copyToClipboard(text: string) {
  if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  }
}

function statusLabel(status: FleetSessionCard["status"]) {
  switch (status) {
    case "running":
      return "Running";
    case "blocked":
      return "Blocked";
    case "completed":
      return "Completed";
    default:
      return "Idle";
  }
}

function createStyles(colors: NativeThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    toolbar: {
      borderBottomWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 24,
      paddingVertical: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      flexWrap: "wrap",
    },
    toolbarText: { flex: 1, minWidth: 220, gap: 4 },
    title: { color: colors.midground, fontSize: 22, fontWeight: "900" },
    subtitle: { color: colors.midgroundFaint, fontSize: 13, lineHeight: 19 },
    statsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", paddingHorizontal: 24, paddingTop: 16 },
    statPill: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: colors.surfaceElevated,
    },
    statText: { color: colors.midground, fontSize: 12, fontWeight: "800" },
    scroll: { flex: 1 },
    scrollContent: { padding: 24, gap: 14, paddingBottom: 32 },
    emptyCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      backgroundColor: colors.surfaceElevated,
      padding: 20,
      gap: 8,
    },
    emptyTitle: { color: colors.midground, fontSize: 16, fontWeight: "900" },
    emptyText: { color: colors.midgroundFaint, fontSize: 14, lineHeight: 21 },
    card: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      backgroundColor: colors.surfaceElevated,
      padding: 16,
      gap: 10,
    },
    cardActive: { borderColor: colors.borderStrong, backgroundColor: colors.accent },
    cardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
    cardTitleWrap: { flex: 1, minWidth: 0, gap: 4 },
    cardTitle: { color: colors.midground, fontSize: 16, fontWeight: "900" },
    cardMeta: { color: colors.midgroundFaint, fontSize: 12, lineHeight: 18 },
    cardActivity: { color: colors.midground, fontSize: 14, lineHeight: 21 },
    summaryPreview: { color: colors.midgroundFaint, fontSize: 13, lineHeight: 20 },
    cardActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
    actionButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 7,
      backgroundColor: colors.surface,
    },
    actionText: { color: colors.midground, fontSize: 12, fontWeight: "800" },
    stopButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: colors.destructiveBorder,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 7,
      backgroundColor: colors.destructiveSurface,
    },
    stopText: { color: colors.destructiveText, fontSize: 12, fontWeight: "800" },
    flowRoot: { gap: 0 },
    flowTrunk: {
      marginLeft: 28,
      paddingLeft: 18,
      borderLeftWidth: 2,
      borderLeftColor: colors.highlight,
      gap: 10,
      paddingTop: 10,
      paddingBottom: 4,
    },
    flowBranchHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 4,
    },
    flowBranchLabel: {
      color: colors.success,
      fontSize: 11,
      fontWeight: "900",
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    flowBranchCount: { color: colors.midgroundFaint, fontSize: 11, fontWeight: "700" },
  });
}

function FleetSessionCardView({
  card,
  attentionRequests,
  nowMs,
  onOpenChat,
  onStopSession,
  onRespondAttention,
}: {
  card: FleetSessionCard;
  attentionRequests: AttentionRequest[];
  nowMs: number;
  onOpenChat: (sessionId: string) => void;
  onStopSession: (sessionId: string) => void;
  onRespondAttention: (requestId: string) => void;
}) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const hasSubagents = card.subagentTree.length > 0;
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [treeExpanded, setTreeExpanded] = useState(
    () => card.isDelegating || card.subagentActiveCount > 0,
  );
  const targetId = card.gatewayId ?? card.sessionId;
  const cardAttention = attentionRequests.filter(
    (request) => request.sessionId === card.sessionId || request.sessionId === targetId,
  );
  const summaryText = summarizeFleetCard(card);
  const canStop = card.status === "running" || card.status === "blocked";

  useEffect(() => {
    if (card.isDelegating || card.subagentActiveCount > 0) {
      setTreeExpanded(true);
    }
  }, [card.isDelegating, card.subagentActiveCount]);

  return (
    <View style={styles.flowRoot}>
      <View style={[styles.card, card.isActive && styles.cardActive]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleWrap}>
            <Text selectable style={styles.cardTitle}>{card.label}</Text>
            <Text selectable style={styles.cardMeta}>
              Lead agent · {card.sessionId.slice(0, 8)}
              {card.isActive ? " · active chat" : ""}
              {card.isDelegating ? " · delegating" : ""}
              {card.subagentCount > 0 ? ` · ${card.subagentCount} subagent${card.subagentCount === 1 ? "" : "s"}` : ""}
              {card.attentionCount > 0 ? ` · ${card.attentionCount} attention` : ""}
            </Text>
          </View>
          <MiniBadge label={statusLabel(card.status)} active={card.status === "running"} />
        </View>

        <Text selectable style={styles.cardActivity} numberOfLines={summaryExpanded ? undefined : 3}>
          {card.status === "running" ? card.activity : summaryText}
        </Text>

        {card.missionSummary?.summaryText && card.status === "completed" && !summaryExpanded ? (
          <Text selectable style={styles.summaryPreview} numberOfLines={2}>
            {card.missionSummary.summaryText}
          </Text>
        ) : null}

        <View style={styles.cardActions}>
          <Pressable
            style={styles.actionButton}
            onPress={() => onOpenChat(targetId)}
            accessibilityRole="button"
            accessibilityLabel={`Open chat for ${card.label}`}
          >
            <MessageSquare color={colors.midground} size={14} />
            <Text style={styles.actionText}>Open chat</Text>
          </Pressable>

          {hasSubagents ? (
            <Pressable
              style={styles.actionButton}
              onPress={() => setTreeExpanded((value) => !value)}
              accessibilityRole="button"
              accessibilityLabel={treeExpanded ? "Hide subagent tree" : "Show subagent tree"}
            >
              <GitBranch color={colors.midground} size={14} />
              <Text style={styles.actionText}>{treeExpanded ? "Hide tree" : "Show tree"}</Text>
            </Pressable>
          ) : null}

          {card.status === "blocked" && cardAttention[0] ? (
            <Pressable
              style={styles.actionButton}
              onPress={() => onRespondAttention(cardAttention[0].id)}
              accessibilityRole="button"
              accessibilityLabel={`Respond to blocked session ${card.label}`}
            >
              <Text style={styles.actionText}>Respond</Text>
            </Pressable>
          ) : null}

          {card.missionSummary?.summaryText ? (
            <Pressable
              style={styles.actionButton}
              onPress={() => setSummaryExpanded((value) => !value)}
              accessibilityRole="button"
              accessibilityLabel={summaryExpanded ? "Hide summary" : "View summary"}
            >
              <Text style={styles.actionText}>{summaryExpanded ? "Hide summary" : "View summary"}</Text>
            </Pressable>
          ) : null}

          {card.missionSummary?.summaryText ? (
            <Pressable
              style={styles.actionButton}
              onPress={() => void copyToClipboard(card.missionSummary?.summaryText ?? "")}
              accessibilityRole="button"
              accessibilityLabel="Copy mission summary"
            >
              <ClipboardCopy color={colors.midground} size={14} />
              <Text style={styles.actionText}>Copy</Text>
            </Pressable>
          ) : null}

          {canStop ? (
            <Pressable
              style={styles.stopButton}
              onPress={() => onStopSession(targetId)}
              accessibilityRole="button"
              accessibilityLabel={`Stop session ${card.label}`}
            >
              <Square color={colors.destructiveText} size={14} />
              <Text style={styles.stopText}>Stop</Text>
            </Pressable>
          ) : null}
        </View>

        {summaryExpanded && card.missionSummary?.summaryText ? (
          <Text selectable style={styles.summaryPreview}>{card.missionSummary.summaryText}</Text>
        ) : null}
      </View>

      {hasSubagents && treeExpanded ? (
        <View style={styles.flowTrunk}>
          <View style={styles.flowBranchHeader}>
            <GitBranch color={colors.success} size={14} />
            <Text style={styles.flowBranchLabel}>Delegated work</Text>
            {card.subagentActiveCount > 0 ? (
              <Text style={styles.flowBranchCount}>{card.subagentActiveCount} active</Text>
            ) : null}
          </View>
          {card.subagentTree.map((node) => (
            <SubagentTreeNode
              key={node.item.id}
              node={node}
              depth={0}
              nowMs={nowMs}
              variant="compact"
              showConnector
              defaultExpanded={node.aggregate.activeCount > 0 || node.children.length > 0}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function FleetMissionControlView({
  snapshot,
  status,
  connected,
  attentionRequests,
  sessions,
  activeSessionId,
  onSendPrompt,
  onOpenChat,
  onStopSession,
  onRespondAttention,
  onOpenAttentionSession,
  onOpenSessionMissionControl,
}: Props) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <View style={styles.toolbarText}>
          <Text selectable style={styles.title}>Fleet Mission Control</Text>
          <Text selectable style={styles.subtitle}>
            Manage chats you've opened or prompted from this app. Delegated subagents appear in a tree below each lead agent.
            {status ? ` · ${status}` : ""}
          </Text>
        </View>
        {onOpenSessionMissionControl ? (
          <SecondaryButton label="Session detail" onPress={onOpenSessionMissionControl} />
        ) : null}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statPill}><Text style={styles.statText}>Running {snapshot.runningCount}</Text></View>
        <View style={styles.statPill}><Text style={styles.statText}>Blocked {snapshot.blockedCount}</Text></View>
        <View style={styles.statPill}><Text style={styles.statText}>Completed {snapshot.completedCount}</Text></View>
        <View style={styles.statPill}><Text style={styles.statText}>Total {snapshot.sessions.length}</Text></View>
      </View>

      <AttentionInbox
        variant="compact"
        requests={attentionRequests}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onRespond={onRespondAttention}
        onOpenSession={onOpenAttentionSession}
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {snapshot.sessions.length === 0 ? (
          <View style={styles.emptyCard}>
            <LayoutGrid color={colors.midgroundFaint} size={24} />
            <Text selectable style={styles.emptyTitle}>No fleet activity yet</Text>
            <Text selectable style={styles.emptyText}>
              Start a chat, spawn a second agent, or send a prompt below. Only your GUI sessions appear here — not every background Hermes process.
            </Text>
          </View>
        ) : (
          snapshot.sessions.map((card) => (
            <FleetSessionCardView
              key={card.sessionId}
              card={card}
              attentionRequests={attentionRequests}
              nowMs={nowMs}
              onOpenChat={onOpenChat}
              onStopSession={onStopSession}
              onRespondAttention={onRespondAttention}
            />
          ))
        )}
      </ScrollView>

      <FleetPromptComposer
        snapshot={snapshot}
        connected={connected}
        onSend={onSendPrompt}
      />
    </View>
  );
}
