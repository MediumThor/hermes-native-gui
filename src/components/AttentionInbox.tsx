import { AlertTriangle, KeyRound, LockKeyhole, MessageCircleQuestion, ShieldAlert } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { AttentionRequest, AttentionKind } from "../attentionInbox";
import { attentionSessionLabel } from "../attentionInbox";
import type { SessionSummary } from "../types";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";
import type { NativeThemeColors } from "../themes/types";

type Props = {
  requests: AttentionRequest[];
  sessions: SessionSummary[];
  activeSessionId: string | null;
  onRespond: (requestId: string) => void;
  onOpenSession: (sessionId: string) => void;
  variant?: "default" | "compact";
};

const KIND_LABEL: Record<AttentionKind, string> = {
  approval: "Approval",
  clarify: "Clarification",
  sudo: "Sudo",
  secret: "Secret",
};

function iconFor(kind: AttentionKind) {
  switch (kind) {
    case "approval":
      return ShieldAlert;
    case "clarify":
      return MessageCircleQuestion;
    case "sudo":
      return LockKeyhole;
    case "secret":
      return KeyRound;
    default:
      return AlertTriangle;
  }
}

function createStyles(colors: NativeThemeColors) {
  return StyleSheet.create({
    root: {
      borderBottomWidth: 1,
      borderColor: colors.warning,
      backgroundColor: colors.systemSurface,
      paddingHorizontal: 24,
      paddingVertical: 12,
      gap: 10,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      flexWrap: "wrap",
    },
    headerText: { flex: 1, minWidth: 220, gap: 2 },
    eyebrow: {
      color: colors.warning,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1.1,
      textTransform: "uppercase",
    },
    title: { color: colors.midground, fontSize: 16, fontWeight: "900" },
    subtitle: { color: colors.midgroundFaint, fontSize: 12, lineHeight: 18 },
    list: { maxHeight: 180 },
    listContent: { gap: 8, paddingRight: 2 },
    requestCard: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 14,
      padding: 12,
      gap: 8,
    },
    requestTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    requestIcon: {
      width: 30,
      height: 30,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.warning,
      backgroundColor: colors.systemSurface,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1,
    },
    requestText: { flex: 1, minWidth: 0, gap: 3 },
    requestTitle: { color: colors.midground, fontWeight: "900", fontSize: 14 },
    requestMeta: { color: colors.warning, fontSize: 11, fontWeight: "800" },
    requestDescription: { color: colors.midgroundFaint, fontSize: 12, lineHeight: 18 },
    preview: {
      color: colors.midgroundFaint,
      fontSize: 12,
      lineHeight: 17,
      borderLeftWidth: 2,
      borderColor: colors.borderStrong,
      paddingLeft: 8,
    },
    actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
    primaryButton: {
      borderRadius: 10,
      backgroundColor: colors.warning,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    primaryText: { color: colors.background, fontWeight: "900", fontSize: 12 },
    secondaryButton: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.surface,
    },
    secondaryText: { color: colors.midground, fontWeight: "800", fontSize: 12 },
    compactRoot: {
      marginHorizontal: 24,
      marginTop: 12,
      borderWidth: 1,
      borderColor: colors.warning,
      backgroundColor: colors.systemSurface,
      borderRadius: 14,
      padding: 12,
      gap: 8,
    },
    compactHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    compactTitle: { color: colors.midground, fontSize: 13, fontWeight: "900", flex: 1 },
    compactItem: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 10,
      padding: 10,
      gap: 6,
      backgroundColor: colors.surfaceElevated,
    },
    compactActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  });
}

export function AttentionInbox({
  requests,
  sessions,
  activeSessionId,
  onRespond,
  onOpenSession,
  variant = "default",
}: Props) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (requests.length === 0) return null;

  const sessionTitle = (request: AttentionRequest) => {
    const direct = sessions.find((session) => session.id === request.sessionId)?.title;
    return attentionSessionLabel(request, direct);
  };

  if (variant === "compact") {
    return (
      <View style={styles.compactRoot}>
        <View style={styles.compactHeader}>
          <Text selectable style={styles.eyebrow}>Needs attention</Text>
          <Text selectable style={styles.compactTitle}>
            {requests.length} blocked {requests.length === 1 ? "item" : "items"}
          </Text>
        </View>
        {requests.slice(0, 3).map((request) => {
          const active = activeSessionId === request.sessionId;
          return (
            <View key={request.id} style={styles.compactItem}>
              <Text selectable style={styles.requestMeta}>
                {KIND_LABEL[request.kind]} · {sessionTitle(request)}
              </Text>
              <Text selectable style={styles.requestDescription} numberOfLines={2}>{request.description}</Text>
              <View style={styles.compactActions}>
                <Pressable
                  style={styles.primaryButton}
                  onPress={() => onRespond(request.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Respond to ${KIND_LABEL[request.kind].toLowerCase()} request`}
                >
                  <Text style={styles.primaryText}>Respond</Text>
                </Pressable>
                {!active ? (
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => onOpenSession(request.sessionId)}
                    accessibilityRole="button"
                    accessibilityLabel="Open blocked session"
                  >
                    <Text style={styles.secondaryText}>Open chat</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text selectable style={styles.eyebrow}>Needs Attention</Text>
          <Text selectable style={styles.title}>
            {requests.length} blocked {requests.length === 1 ? "session" : "items"}
          </Text>
          <Text selectable style={styles.subtitle}>
            Approvals, clarifications, sudo prompts, and secrets are collected here across all sessions.
          </Text>
        </View>
      </View>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {requests.map((request) => {
          const Icon = iconFor(request.kind);
          const active = activeSessionId === request.sessionId;
          return (
            <View key={request.id} style={styles.requestCard}>
              <View style={styles.requestTop}>
                <View style={styles.requestIcon}>
                  <Icon color={colors.warning} size={16} />
                </View>
                <View style={styles.requestText}>
                  <Text selectable style={styles.requestMeta}>
                    {KIND_LABEL[request.kind]} · {sessionTitle(request)}{active ? " · open" : ""}
                  </Text>
                  <Text selectable style={styles.requestTitle} numberOfLines={1}>{request.title}</Text>
                  <Text selectable style={styles.requestDescription} numberOfLines={2}>{request.description}</Text>
                </View>
              </View>
              {request.preview ? (
                <Text selectable style={styles.preview} numberOfLines={2}>{request.preview}</Text>
              ) : null}
              <View style={styles.actions}>
                <Pressable
                  style={styles.primaryButton}
                  onPress={() => onRespond(request.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Respond to ${KIND_LABEL[request.kind].toLowerCase()} request`}
                >
                  <Text style={styles.primaryText}>Respond</Text>
                </Pressable>
                {!active ? (
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => onOpenSession(request.sessionId)}
                    accessibilityRole="button"
                    accessibilityLabel="Open blocked session"
                  >
                    <Text style={styles.secondaryText}>Open chat</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
