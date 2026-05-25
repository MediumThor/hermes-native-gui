import { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { SessionRuntimeState } from "../types";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";
import type { NativeThemeColors } from "../themes/types";

type Props = {
  sessionLabel: string;
  sessionId: string;
  runtime?: SessionRuntimeState;
  active?: boolean;
  onOpen: () => void;
};

export function RunningSessionBanner({ sessionLabel, sessionId, runtime, active = false, onOpen }: Props) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const activity = runtime?.activity?.trim() || "Hermes is working in another chat.";

  return (
    <Pressable style={styles.banner} onPress={onOpen} accessibilityRole="button">
      <View style={styles.bannerRow}>
        <ActivityIndicator color={colors.success} size="small" />
        <View style={styles.bannerText}>
          <Text style={styles.bannerTitle}>
            {active ? "Agent running in this chat" : `Agent running in ${sessionLabel}`}
          </Text>
          <Text selectable style={styles.bannerSubtitle} numberOfLines={2}>
            {activity} · Session {sessionId.slice(0, 8)}
          </Text>
        </View>
        <Text style={styles.bannerAction}>{active ? "Current" : "Open"}</Text>
      </View>
    </Pressable>
  );
}

function createStyles(colors: NativeThemeColors) {
  return StyleSheet.create({
  banner: {
    marginHorizontal: 24,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.accent,
    borderRadius: 16,
    padding: 14,
  },
  bannerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bannerText: { flex: 1, minWidth: 0, gap: 4 },
  bannerTitle: {
    color: colors.midground,
    fontWeight: "900",
    fontSize: 15,
  },
  bannerSubtitle: {
    color: colors.midgroundFaint,
    fontSize: 13,
    lineHeight: 18,
  },
  bannerAction: {
    color: colors.midground,
    fontWeight: "900",
    fontSize: 13,
  },
  });
}

