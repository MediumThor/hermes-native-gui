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
  onPress: () => void;
};

export function RunningSessionPill({
  sessionLabel,
  sessionId,
  runtime,
  active = false,
  onPress,
}: Props) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const activity = runtime?.activity?.trim() || "Working…";
  const title = active ? "Running here" : `Agent running in ${sessionLabel}`;

  return (
    <Pressable
      style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={active ? "Agent running in this chat" : `Open running agent in ${sessionLabel}`}
    >
      <ActivityIndicator color={colors.success} size="small" />
      <View style={styles.pillText}>
        <Text selectable style={styles.pillTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text selectable style={styles.pillSubtitle} numberOfLines={1}>
          {activity} · {sessionId.slice(0, 8)}
        </Text>
      </View>
      <Text style={styles.pillAction}>{active ? "Current" : "Open"}</Text>
    </Pressable>
  );
}

function createStyles(colors: NativeThemeColors) {
  return StyleSheet.create({
    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      maxWidth: 320,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.accent,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    pillPressed: {
      backgroundColor: colors.surfaceElevated,
    },
    pillText: {
      flex: 1,
      minWidth: 0,
      gap: 1,
    },
    pillTitle: {
      color: colors.midground,
      fontWeight: "900",
      fontSize: 12,
    },
    pillSubtitle: {
      color: colors.midgroundFaint,
      fontSize: 11,
    },
    pillAction: {
      color: colors.midground,
      fontWeight: "900",
      fontSize: 11,
      flexShrink: 0,
    },
  });
}
