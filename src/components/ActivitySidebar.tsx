import { ChevronDown, ChevronRight } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { FleetSessionCard, FleetSnapshot } from "../fleetMission";
import { fleetFocusTargetId, summarizeFleetCard } from "../fleetMission";
import { flattenSubagentTree } from "../subagentTree";
import type { SubagentNode, SubagentProgress } from "../subagentTypes";
import type { ToolActivity } from "../types";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";
import type { NativeThemeColors } from "../themes/types";
import { RunningAgentsPanel } from "./RunningAgentsPanel";
import { ToolActivityCard } from "./ToolActivityCard";

type Props = {
  tools: ToolActivity[];
  subagentTree: SubagentNode[];
  subagents: SubagentProgress[];
  fleetSnapshot: FleetSnapshot;
  delegationActive: boolean;
  leadThought?: string;
  leadStreaming?: boolean;
  onOpenSession: (sessionId: string) => void;
};

function createStyles(colors: NativeThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      minHeight: 0,
      flexDirection: "column",
    },
    pane: {
      flexGrow: 1,
      flexShrink: 1,
      minHeight: 0,
    },
    paneCollapsed: {
      flexGrow: 0,
      flexShrink: 0,
    },
    paneHeader: {
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 8,
      gap: 2,
      backgroundColor: colors.surface,
      flexShrink: 0,
      minHeight: 52,
    },
    paneHeaderCollapsed: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    paneHeaderButton: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
    },
    paneHeaderText: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    paneChevron: {
      marginTop: 2,
    },
    missionPane: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    paneTitle: {
      color: colors.midground,
      fontSize: 16,
      fontWeight: "900",
    },
    paneSubtitle: {
      color: colors.midgroundFaint,
      fontSize: 12,
      lineHeight: 18,
    },
    scroll: {
      flex: 1,
      minHeight: 0,
    },
    scrollContent: {
      paddingHorizontal: 14,
      paddingBottom: 16,
      gap: 10,
    },
    compactEmptyState: {
      gap: 8,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      backgroundColor: colors.surfaceElevated,
    },
    compactEmptyTitle: {
      color: colors.midground,
      fontWeight: "800",
    },
    compactEmptyText: {
      color: colors.midgroundFaint,
      fontSize: 12,
      lineHeight: 18,
    },
    chatCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 12,
      backgroundColor: colors.surfaceElevated,
      gap: 8,
    },
    chatCardActive: {
      borderColor: colors.borderStrong,
      backgroundColor: colors.accent,
    },
    chatCardPressed: {
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
    },
    chatHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 8,
    },
    chatTitle: {
      color: colors.midground,
      fontSize: 13,
      fontWeight: "800",
      flex: 1,
    },
    chatStatus: {
      color: colors.midgroundFaint,
      fontSize: 11,
      textTransform: "capitalize",
    },
    chatActivity: {
      color: colors.midgroundFaint,
      fontSize: 12,
      lineHeight: 18,
    },
    sessionBlock: { gap: 8 },
    missionAgentsTrunk: {
      marginLeft: 20,
      paddingLeft: 14,
      borderLeftWidth: 2,
      borderLeftColor: colors.highlight,
      gap: 8,
      paddingTop: 4,
    },
    subsection: {
      gap: 8,
      marginTop: 4,
    },
    subsectionTitle: {
      color: colors.midgroundMuted,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },
  });
}

function RunningChatsPanel({
  sessions,
  onOpenSession,
  styles,
  leadThought,
  leadStreaming,
}: {
  sessions: FleetSessionCard[];
  onOpenSession: (sessionId: string) => void;
  styles: ReturnType<typeof createStyles>;
  leadThought?: string;
  leadStreaming?: boolean;
}) {
  const active = sessions.filter((session) => session.status === "running" || session.status === "blocked");
  if (active.length === 0) return null;

  return (
    <View style={styles.subsection}>
      <Text selectable style={styles.subsectionTitle}>Running chats</Text>
      {active.map((session) => {
        const focusId = fleetFocusTargetId(session);
        const sessionSubagents = flattenSubagentTree(session.subagentTree);
        const showDelegation =
          session.isDelegating ||
          session.subagentActiveCount > 0 ||
          (session.isActive && Boolean(leadThought?.trim()));

        return (
          <View key={focusId} style={styles.sessionBlock}>
            <Pressable
              style={({ pressed }) => [
                styles.chatCard,
                session.isActive && styles.chatCardActive,
                pressed && styles.chatCardPressed,
              ]}
              onPress={() => onOpenSession(focusId)}
              accessibilityRole="button"
              accessibilityLabel={
                session.isActive
                  ? `${session.label}, current chat — focus chat`
                  : `Switch to ${session.label}`
              }
            >
              <View style={styles.chatHeader}>
                <Text selectable style={styles.chatTitle} numberOfLines={2}>
                  {session.label}
                </Text>
                <Text selectable style={styles.chatStatus}>{session.status}</Text>
              </View>
              <Text selectable style={styles.chatActivity} numberOfLines={3}>
                {summarizeFleetCard(session)}
              </Text>
            </Pressable>

            {showDelegation ? (
              <View style={styles.missionAgentsTrunk}>
                <RunningAgentsPanel
                  tree={session.subagentTree}
                  subagents={sessionSubagents}
                  leadThought={session.isActive ? leadThought : undefined}
                  leadStreaming={session.isActive && leadStreaming}
                  onOpenSession={() => onOpenSession(focusId)}
                  compact
                  embedded
                />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export function ActivitySidebar({
  tools,
  subagentTree,
  subagents,
  fleetSnapshot,
  delegationActive,
  leadThought,
  leadStreaming = false,
  onOpenSession,
}: Props) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [toolsExpanded, setToolsExpanded] = useState(true);

  const runningTools = useMemo(
    () => tools.filter((tool) => tool.status === "running").length,
    [tools],
  );

  const runningChats = useMemo(
    () => fleetSnapshot.sessions.filter((session) => session.status === "running" || session.status === "blocked"),
    [fleetSnapshot.sessions],
  );
  const showMissionSection =
    runningChats.length > 0 ||
    delegationActive ||
    subagents.length > 0 ||
    Boolean(leadThought?.trim());

  return (
    <View style={styles.root}>
      <View style={[styles.pane, !toolsExpanded && styles.paneCollapsed]}>
        <Pressable
          style={[styles.paneHeader, !toolsExpanded && styles.paneHeaderCollapsed]}
          onPress={() => setToolsExpanded((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: toolsExpanded }}
          accessibilityLabel={toolsExpanded ? "Collapse tool activity" : "Expand tool activity"}
        >
          <View style={styles.paneHeaderButton}>
            <View style={styles.paneChevron}>
              {toolsExpanded ? (
                <ChevronDown color={colors.midgroundFaint} size={16} />
              ) : (
                <ChevronRight color={colors.midgroundFaint} size={16} />
              )}
            </View>
            <View style={styles.paneHeaderText}>
              <Text selectable style={styles.paneTitle}>Tool activity</Text>
              <Text selectable style={styles.paneSubtitle}>
                {tools.length} recent tool calls
                {runningTools > 0 ? ` · ${runningTools} running` : ""}
              </Text>
            </View>
          </View>
        </Pressable>
        {toolsExpanded ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {tools.length === 0 ? (
              <View style={styles.compactEmptyState}>
                <Text selectable style={styles.compactEmptyTitle}>Nothing running yet.</Text>
                <Text selectable style={styles.compactEmptyText}>
                  Tool calls, progress, and results will appear here while Hermes works.
                </Text>
              </View>
            ) : (
              tools.map((tool) => <ToolActivityCard key={tool.id} tool={tool} compact />)
            )}
          </ScrollView>
        ) : null}
      </View>

      {showMissionSection ? (
        <View style={[styles.pane, styles.missionPane]}>
          <View style={styles.paneHeader}>
            <Text selectable style={styles.paneTitle}>Mission control</Text>
            <Text selectable style={styles.paneSubtitle}>
              {runningChats.length} running {runningChats.length === 1 ? "chat" : "chats"}
              {delegationActive || subagents.length > 0 ? " · delegation active" : ""}
            </Text>
          </View>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {runningChats.length > 0 ? (
              <RunningChatsPanel
                sessions={fleetSnapshot.sessions}
                onOpenSession={onOpenSession}
                styles={styles}
                leadThought={leadThought}
                leadStreaming={leadStreaming}
              />
            ) : delegationActive || subagents.length > 0 || leadThought?.trim() ? (
              <RunningAgentsPanel
                tree={subagentTree}
                subagents={subagents}
                leadThought={leadThought}
                leadStreaming={leadStreaming}
                onOpenSession={() => {
                  const active = fleetSnapshot.sessions.find((session) => session.isActive);
                  if (active) onOpenSession(fleetFocusTargetId(active));
                }}
                compact
                embedded
              />
            ) : null}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
