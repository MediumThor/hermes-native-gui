import { useMemo } from "react";
import { Check, LayoutGrid, LayoutList, RefreshCw, Trash2 } from "lucide-react-native";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { SessionsViewMode } from "../useAppSettings";
import type { SessionRuntimeState, SessionSummary } from "../types";
import { dedupeSessionList, type DedupedSessionSummary } from "../sessionListDedup";
import { SessionStatusBadge } from "./SessionStatusBadge";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";
import type { NativeThemeColors } from "../themes/types";

type Props = {
  sessions: SessionSummary[];
  unsavedLiveSessions?: SessionSummary[];
  sessionRuntime: Record<string, SessionRuntimeState>;
  sessionKeyByGatewayId: Record<string, string>;
  gatewayIdBySessionKey: Record<string, string>;
  activeGatewaySessionId: string | null;
  activeDbSessionId: string | null;
  resolveSessionRuntime: (sessionId: string) => SessionRuntimeState | undefined;
  loading: boolean;
  connected: boolean;
  sessionSwitchDisabled: boolean;
  canSwitchToSession: (sessionId: string) => boolean;
  liveResponseAt?: Record<string, number>;
  viewMode: SessionsViewMode;
  onViewModeChange: (mode: SessionsViewMode) => void;
  onRefresh: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
};

type SessionCardProps = {
  session: DedupedSessionSummary;
  runtime: SessionRuntimeState | undefined;
  active: boolean;
  disabled: boolean;
  cardDisabled: boolean;
  switchTarget: string;
  deleteTarget: string | null;
  grid: boolean;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
};

function sessionLastResponseAt(
  session: SessionSummary,
  resolveSessionRuntime: (sessionId: string) => SessionRuntimeState | undefined,
  liveResponseAt: Record<string, number>,
): number {
  const runtime = resolveSessionRuntime(session.id);
  const base = Math.max(
    liveResponseAt[session.id] ?? 0,
    session.last_response_at ?? 0,
    session.started_at ?? 0,
  );
  if (runtime?.running) return Math.max(base, runtime.updatedAt ?? 0);
  return base;
}

function sessionSortScore(
  session: SessionSummary,
  resolveSessionRuntime: (sessionId: string) => SessionRuntimeState | undefined,
) {
  const runtime = resolveSessionRuntime(session.id);
  if (runtime?.running) return 0;
  return 1;
}

function sessionIsActive(
  sessionId: string,
  activeGatewaySessionId: string | null,
  activeDbSessionId: string | null,
  sessionKeyByGatewayId: Record<string, string>,
  gatewayIdBySessionKey: Record<string, string>,
): boolean {
  if (!activeGatewaySessionId && !activeDbSessionId) return false;
  if (sessionId === activeGatewaySessionId || sessionId === activeDbSessionId) return true;
  if (activeGatewaySessionId && sessionKeyByGatewayId[activeGatewaySessionId] === sessionId) return true;
  if (activeDbSessionId && gatewayIdBySessionKey[sessionId] === activeGatewaySessionId) return true;
  return false;
}

function countRunningSessions(
  sessionRuntime: Record<string, SessionRuntimeState>,
  sessionKeyByGatewayId: Record<string, string>,
) {
  const seen = new Set<string>();
  let count = 0;
  for (const [id, state] of Object.entries(sessionRuntime)) {
    if (!state.running) continue;
    const canonical = sessionKeyByGatewayId[id] ?? id;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    count += 1;
  }
  return count;
}

function sessionSwitchTarget(
  sessionId: string,
  listedIds: Set<string>,
  gatewayIdBySessionKey: Record<string, string>,
): string {
  if (listedIds.has(sessionId)) return sessionId;
  return gatewayIdBySessionKey[sessionId] ?? sessionId;
}

function SessionCard({
  session,
  runtime,
  active,
  disabled,
  cardDisabled,
  switchTarget,
  deleteTarget,
  grid,
  onSelectSession,
  onDeleteSession,
}: SessionCardProps) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const displayTitle = runtime?.running
    ? `Running · ${session.title || session.id.slice(0, 8)}`
    : session.title || session.id;

  return (
    <Pressable
      style={[
        styles.sessionCard,
        grid && styles.sessionCardGrid,
        active && styles.sessionCardActive,
        runtime?.running && styles.sessionCardRunning,
        disabled && styles.buttonDisabled,
        cardDisabled && !active && styles.buttonDisabled,
      ]}
      onPress={() => {
        onSelectSession(switchTarget);
      }}
      disabled={cardDisabled}
    >
      <View style={styles.sessionCardHeader}>
        <Text selectable style={styles.sessionTitle} numberOfLines={grid ? 2 : 1}>
          {displayTitle}
        </Text>
        <View style={styles.sessionBadges}>
          <SessionStatusBadge runtime={runtime} active={active} />
          {active ? <Check color={colors.midground} size={18} /> : null}
          {onDeleteSession && deleteTarget && !active ? (
            <Pressable
              style={styles.deleteButton}
              onPress={(event) => {
                event.stopPropagation?.();
                onDeleteSession(deleteTarget);
              }}
              accessibilityRole="button"
              accessibilityLabel="Delete session"
            >
              <Trash2 color={colors.destructiveText} size={16} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <Text selectable style={styles.sessionMeta}>
        {session.message_count} messages · {session.source || "session"} · {session.id.slice(0, 8)}
        {session.duplicateCount && session.duplicateCount > 1
          ? ` · ${session.duplicateCount} resume copies merged`
          : ""}
      </Text>
      {runtime?.running && runtime.activity ? (
        <Text selectable style={styles.sessionActivity} numberOfLines={grid ? 3 : 2}>
          {runtime.activity}
        </Text>
      ) : null}
      {session.preview ? (
        <Text selectable style={styles.sessionPreview} numberOfLines={grid ? 4 : 3}>
          {session.preview}
        </Text>
      ) : null}
    </Pressable>
  );
}

function ViewModeToggle({
  viewMode,
  onViewModeChange,
}: {
  viewMode: SessionsViewMode;
  onViewModeChange: (mode: SessionsViewMode) => void;
}) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.viewModeToggle}>
      <Pressable
        style={[styles.viewModeButton, viewMode === "list" && styles.viewModeButtonActive]}
        onPress={() => onViewModeChange("list")}
        accessibilityRole="button"
        accessibilityLabel="List view"
        accessibilityState={{ selected: viewMode === "list" }}
      >
        <LayoutList color={viewMode === "list" ? colors.onBackground : colors.midground} size={16} />
      </Pressable>
      <Pressable
        style={[styles.viewModeButton, viewMode === "grid" && styles.viewModeButtonActive]}
        onPress={() => onViewModeChange("grid")}
        accessibilityRole="button"
        accessibilityLabel="Grid view"
        accessibilityState={{ selected: viewMode === "grid" }}
      >
        <LayoutGrid color={viewMode === "grid" ? colors.onBackground : colors.midground} size={16} />
      </Pressable>
    </View>
  );
}

export function SessionsSection({
  sessions,
  unsavedLiveSessions = [],
  sessionRuntime,
  sessionKeyByGatewayId,
  gatewayIdBySessionKey,
  activeGatewaySessionId,
  activeDbSessionId,
  resolveSessionRuntime,
  loading,
  connected,
  sessionSwitchDisabled,
  canSwitchToSession,
  liveResponseAt = {},
  viewMode,
  onViewModeChange,
  onRefresh,
  onSelectSession,
  onDeleteSession,
}: Props) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const runningCount = countRunningSessions(sessionRuntime, sessionKeyByGatewayId);
  const dedupedSessions = useMemo(
    () => dedupeSessionList(sessions, resolveSessionRuntime),
    [resolveSessionRuntime, sessions],
  );
  const listedIds = new Set(dedupedSessions.map((session) => session.id));
  const runningOnlySessions: SessionSummary[] = [];
  const seenRunning = new Set<string>();
  for (const [id, state] of Object.entries(sessionRuntime)) {
    if (!state.running) continue;
    const canonical = sessionKeyByGatewayId[id] ?? id;
    if (seenRunning.has(canonical)) continue;
    if (listedIds.has(canonical) || listedIds.has(id)) continue;
    seenRunning.add(canonical);
    const dbKey = sessionKeyByGatewayId[id] ?? (canonical.includes("_") ? canonical : null);
    runningOnlySessions.push({
      id: dbKey ?? gatewayIdBySessionKey[canonical] ?? id,
      title: dbKey
        ? `Running · ${dbKey.slice(-6)}`
        : `Running session ${canonical.slice(0, 8)}`,
      preview: state.activity || "Agent running",
      started_at: state.updatedAt,
      last_response_at: state.updatedAt,
      message_count: 0,
      source: "live",
    });
  }
  const allSessions = [...runningOnlySessions, ...dedupedSessions];
  const sortedSessions = [...allSessions].sort((a, b) => {
    const scoreDiff =
      sessionSortScore(a, resolveSessionRuntime) -
      sessionSortScore(b, resolveSessionRuntime);
    if (scoreDiff !== 0) return scoreDiff;
    return (
      sessionLastResponseAt(b, resolveSessionRuntime, liveResponseAt) -
      sessionLastResponseAt(a, resolveSessionRuntime, liveResponseAt)
    );
  });

  const sessionCards = sortedSessions.map((session) => {
    const runtime = resolveSessionRuntime(session.id);
    const active = sessionIsActive(
      session.id,
      activeGatewaySessionId,
      activeDbSessionId,
      sessionKeyByGatewayId,
      gatewayIdBySessionKey,
    );
    const disabled = sessionSwitchDisabled && !active;
    const switchTarget = sessionSwitchTarget(session.id, listedIds, gatewayIdBySessionKey);
    const deleteTarget = listedIds.has(session.id) ? session.id : null;
    const cardDisabled = disabled || !canSwitchToSession(switchTarget);

    return (
      <SessionCard
        key={session.id}
        session={session}
        runtime={runtime}
        active={active}
        disabled={disabled}
        cardDisabled={cardDisabled}
        switchTarget={switchTarget}
        deleteTarget={deleteTarget}
        grid={viewMode === "grid"}
        onSelectSession={onSelectSession}
        onDeleteSession={onDeleteSession}
      />
    );
  });

  return (
    <ScrollView style={styles.fullPane} contentContainerStyle={styles.fullPaneContent}>
      <View style={styles.panelHeaderRow}>
        <View style={styles.headerText}>
          <Text selectable style={styles.sectionTitle}>Recent chats</Text>
          <Text selectable style={styles.sectionSubtitle}>
            {runningCount > 0
              ? `${runningCount} agent${runningCount === 1 ? "" : "s"} running · ${allSessions.length} shown`
              : `Tap a conversation to open it in chat. ${dedupedSessions.length} shown${dedupedSessions.length < sessions.length ? ` (${sessions.length} loaded)` : ""}.`}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <ViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
          <Pressable
            style={[styles.secondaryButton, (!connected || loading) && styles.buttonDisabled]}
            onPress={onRefresh}
            disabled={!connected || loading}
          >
            <View style={styles.refreshRow}>
              {loading ? <ActivityIndicator color={colors.midground} size="small" /> : <RefreshCw color={colors.midground} size={16} />}
              <Text style={styles.secondaryText}>{loading ? "Loading" : "Refresh"}</Text>
            </View>
          </Pressable>
        </View>
      </View>

      {!connected ? (
        <View style={styles.emptyState}>
          <Text selectable style={styles.emptyTitle}>Connect to browse chats</Text>
          <Text selectable style={styles.emptyText}>Connect to the Hermes bridge, then refresh to load your recent sessions.</Text>
        </View>
      ) : allSessions.length === 0 ? (
        <View style={styles.emptyState}>
          <Text selectable style={styles.emptyTitle}>{loading ? "Loading sessions…" : "No recent chats yet"}</Text>
          <Text selectable style={styles.emptyText}>
            {loading ? "Fetching sessions from the bridge." : "Start a new chat or run Hermes from the CLI to create sessions."}
          </Text>
        </View>
      ) : viewMode === "grid" ? (
        <View style={styles.sessionGrid}>{sessionCards}</View>
      ) : (
        <View style={styles.sessionList}>{sessionCards}</View>
      )}
    </ScrollView>
  );
}

function createStyles(colors: NativeThemeColors) {
  return StyleSheet.create({
  fullPane: { flex: 1 },
  fullPaneContent: { padding: 24, gap: 14 },
  panelHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 4,
    flexWrap: "wrap",
  },
  headerText: { flex: 1, minWidth: 0 },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  sectionTitle: { color: colors.midground, fontSize: 18, fontWeight: "900" },
  sectionSubtitle: { color: colors.midgroundFaint, marginTop: 4 },
  viewModeToggle: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
    padding: 3,
    gap: 2,
  },
  viewModeButton: {
    width: 36,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  viewModeButtonActive: {
    backgroundColor: colors.success,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryText: { color: colors.midground, fontWeight: "800" },
  refreshRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  buttonDisabled: { opacity: 0.45 },
  emptyState: {
    marginTop: 12,
    gap: 10,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surfaceElevated,
  },
  emptyTitle: { color: colors.midground, fontSize: 18, fontWeight: "800" },
  emptyText: { color: colors.midgroundFaint, fontSize: 14, lineHeight: 21 },
  sessionList: { gap: 14 },
  sessionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "stretch",
  },
  sessionCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    backgroundColor: colors.surfaceElevated,
    gap: 4,
  },
  sessionCardGrid: {
    flexGrow: 1,
    flexBasis: 280,
    minWidth: 240,
    maxWidth: 420,
  },
  sessionCardActive: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.accent,
  },
  sessionCardRunning: {
    borderColor: colors.borderStrong,
    shadowColor: colors.success,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  sessionCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  sessionBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  deleteButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.destructiveBorder,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.destructiveSurface,
  },
  sessionTitle: {
    flex: 1,
    color: colors.midground,
    fontWeight: "800",
    fontSize: 15,
  },
  sessionMeta: { color: colors.midgroundMuted, fontSize: 12 },
  sessionActivity: {
    color: colors.success,
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  sessionPreview: { color: colors.midgroundFaint, marginTop: 6, fontSize: 13, lineHeight: 18 },
  });
}

