import { useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { isActiveSubagentStatus } from "../subagentReducer";
import type { SubagentNode, SubagentProgress, SubagentStatus } from "../subagentTypes";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";
import type { NativeThemeColors } from "../themes/types";
import { StreamingDots } from "./StreamingDots";

const STATUS_LABEL: Record<SubagentStatus, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Done",
  failed: "Failed",
  interrupted: "Stopped",
};

type Props = {
  tree: SubagentNode[];
  subagents: SubagentProgress[];
  leadThought?: string;
  leadStreaming?: boolean;
  compact?: boolean;
  embedded?: boolean;
  onOpenSession?: () => void;
};

function hasActiveInSubtree(node: SubagentNode): boolean {
  if (isActiveSubagentStatus(node.item.status)) return true;
  return node.children.some(hasActiveInSubtree);
}

function createStyles(colors: NativeThemeColors) {
  return StyleSheet.create({
    section: {
      gap: 10,
      marginTop: 18,
      paddingTop: 18,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    sectionEmbedded: {
      gap: 10,
      marginTop: 0,
      paddingTop: 0,
      borderTopWidth: 0,
    },
    sectionTitle: { color: colors.midground, fontSize: 18, fontWeight: "900" },
    sectionSubtitle: { color: colors.midgroundFaint, fontSize: 12, lineHeight: 18 },
    emptyCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 14,
      backgroundColor: colors.surfaceElevated,
      gap: 6,
    },
    emptyTitle: { color: colors.midground, fontWeight: "800" },
    emptyText: { color: colors.midgroundFaint, fontSize: 12, lineHeight: 18 },
    card: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 14,
      backgroundColor: colors.surfaceElevated,
      gap: 8,
    },
    cardActive: { borderColor: colors.borderStrong, backgroundColor: colors.accent },
    cardPressed: { borderColor: colors.highlight, backgroundColor: colors.surface },
    headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
    title: { color: colors.success, fontWeight: "800", flex: 1, fontSize: 13, lineHeight: 18 },
    status: { color: colors.midgroundFaint, fontSize: 11, textTransform: "capitalize" },
    blockLabel: {
      color: colors.midgroundMuted,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    thoughtText: { color: colors.midgroundFaint, fontSize: 12, lineHeight: 18, fontStyle: "italic" },
    actionLine: {
      color: colors.midgroundFaint,
      fontSize: 11,
      lineHeight: 16,
      fontFamily: "Menlo, monospace",
    },
    hierarchy: { gap: 8 },
    hierarchyTrunk: {
      marginLeft: 20,
      paddingLeft: 14,
      borderLeftWidth: 2,
      borderLeftColor: colors.highlight,
      gap: 8,
      paddingTop: 4,
      paddingBottom: 2,
    },
  });
}

function HierarchyTrunk({
  children,
  styles,
}: {
  children: ReactNode;
  styles: ReturnType<typeof createStyles>;
}) {
  return <View style={styles.hierarchyTrunk}>{children}</View>;
}

function AgentCard({
  item,
  compact,
  onOpenSession,
  styles,
}: {
  item: SubagentProgress;
  compact?: boolean;
  onOpenSession?: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const active = isActiveSubagentStatus(item.status);
  const thought = (item.thinking ?? []).slice(-(compact ? 2 : 4)).join("\n");
  const actions = [...(item.tools ?? []).slice(-3), ...(item.notes ?? []).slice(-2)].filter(Boolean);

  const body = (
    <>
      <View style={styles.headerRow}>
        <Text selectable style={styles.title} numberOfLines={compact ? 3 : undefined}>
          {item.goal || "Subagent"}
        </Text>
        <Text selectable style={styles.status}>{STATUS_LABEL[item.status]}</Text>
      </View>

      {thought ? (
        <View style={{ gap: 4 }}>
          <Text style={styles.blockLabel}>Thought</Text>
          <Text selectable style={styles.thoughtText} numberOfLines={compact ? 4 : undefined}>
            {thought}
          </Text>
        </View>
      ) : null}

      {actions.length > 0 ? (
        <View style={{ gap: 4 }}>
          <Text style={styles.blockLabel}>Actions</Text>
          {actions.map((line, index) => (
            <Text key={`${item.id}-action-${index}`} selectable style={styles.actionLine} numberOfLines={2}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}

      {item.summary ? (
        <View style={{ gap: 4 }}>
          <Text style={styles.blockLabel}>Summary</Text>
          <Text selectable style={styles.thoughtText} numberOfLines={compact ? 3 : undefined}>
            {item.summary}
          </Text>
        </View>
      ) : null}
    </>
  );

  if (!onOpenSession) {
    return <View style={[styles.card, active && styles.cardActive]}>{body}</View>;
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        active && styles.cardActive,
        pressed && styles.cardPressed,
      ]}
      onPress={onOpenSession}
      accessibilityRole="button"
      accessibilityLabel={`Open chat for subagent ${item.goal || "Subagent"}`}
    >
      {body}
    </Pressable>
  );
}

function AgentTreeCards({
  nodes,
  compact,
  styles,
  onOpenSession,
}: {
  nodes: SubagentNode[];
  compact?: boolean;
  styles: ReturnType<typeof createStyles>;
  onOpenSession?: () => void;
}) {
  const visible = nodes.filter(hasActiveInSubtree);
  if (visible.length === 0) return null;

  return (
    <>
      {visible.map((node) => (
        <View key={node.item.id} style={{ gap: 8 }}>
          <AgentCard item={node.item} compact={compact} onOpenSession={onOpenSession} styles={styles} />
          {node.children.length > 0 ? (
            <HierarchyTrunk styles={styles}>
              <AgentTreeCards
                nodes={node.children}
                compact={compact}
                styles={styles}
                onOpenSession={onOpenSession}
              />
            </HierarchyTrunk>
          ) : null}
        </View>
      ))}
    </>
  );
}

export function RunningAgentsPanel({
  tree,
  subagents,
  leadThought,
  leadStreaming = false,
  compact = false,
  embedded = false,
  onOpenSession,
}: Props) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const activeCount = subagents.filter((item) => isActiveSubagentStatus(item.status)).length;
  const showLead = Boolean(leadThought?.trim());
  const hasAgents = activeCount > 0 || showLead;

  const flatFallback = useMemo(() => {
    if (tree.some(hasActiveInSubtree)) return [];
    return subagents.filter((item) => isActiveSubagentStatus(item.status));
  }, [subagents, tree]);

  return (
    <View style={embedded ? styles.sectionEmbedded : styles.section}>
      {!embedded ? (
        <>
          <Text selectable style={styles.sectionTitle}>Running agents</Text>
          <Text selectable style={styles.sectionSubtitle}>
            {activeCount + (showLead ? 1 : 0)} active
            {leadStreaming ? " · lead agent thinking" : ""}
          </Text>
        </>
      ) : (
        <Text selectable style={styles.sectionSubtitle}>
          {activeCount + (showLead ? 1 : 0)} delegated {activeCount + (showLead ? 1 : 0) === 1 ? "agent" : "agents"}
          {leadStreaming ? " · lead agent thinking" : ""}
        </Text>
      )}

      {!hasAgents ? (
        <View style={styles.emptyCard}>
          <Text selectable style={styles.emptyTitle}>No delegated agents yet.</Text>
          <Text selectable style={styles.emptyText}>
            Subagents spawned during this mission will appear here with their goal, thoughts, and tool actions.
          </Text>
        </View>
      ) : (
        <View style={styles.hierarchy}>
          {showLead ? (
            onOpenSession ? (
              <Pressable
                style={({ pressed }) => [
                  styles.card,
                  styles.cardActive,
                  pressed && styles.cardPressed,
                ]}
                onPress={onOpenSession}
                accessibilityRole="button"
                accessibilityLabel="Open chat for lead agent"
              >
                <View style={styles.headerRow}>
                  <Text selectable style={styles.title}>Lead agent</Text>
                  <Text selectable style={styles.status}>{leadStreaming ? "Running" : "Thinking"}</Text>
                </View>
                <View style={{ gap: 4 }}>
                  <Text style={styles.blockLabel}>Thought</Text>
                  <Text selectable style={styles.thoughtText} numberOfLines={compact ? 6 : undefined}>
                    {leadThought}
                  </Text>
                  {leadStreaming ? <StreamingDots active color={colors.success} /> : null}
                </View>
              </Pressable>
            ) : (
              <View style={[styles.card, styles.cardActive]}>
                <View style={styles.headerRow}>
                  <Text selectable style={styles.title}>Lead agent</Text>
                  <Text selectable style={styles.status}>{leadStreaming ? "Running" : "Thinking"}</Text>
                </View>
                <View style={{ gap: 4 }}>
                  <Text style={styles.blockLabel}>Thought</Text>
                  <Text selectable style={styles.thoughtText} numberOfLines={compact ? 6 : undefined}>
                    {leadThought}
                  </Text>
                  {leadStreaming ? <StreamingDots active color={colors.success} /> : null}
                </View>
              </View>
            )
          ) : null}

          {(() => {
            const hasTree = tree.some(hasActiveInSubtree);
            const hasFallback = flatFallback.length > 0;
            if (!hasTree && !hasFallback) return null;

            const branch = (
              <>
                {hasTree ? (
                  <AgentTreeCards
                    nodes={tree}
                    compact={compact}
                    styles={styles}
                    onOpenSession={onOpenSession}
                  />
                ) : null}
                {flatFallback.map((item) => (
                  <AgentCard
                    key={item.id}
                    item={item}
                    compact={compact}
                    onOpenSession={onOpenSession}
                    styles={styles}
                  />
                ))}
              </>
            );

            return showLead ? <HierarchyTrunk styles={styles}>{branch}</HierarchyTrunk> : branch;
          })()}
        </View>
      )}
    </View>
  );
}
