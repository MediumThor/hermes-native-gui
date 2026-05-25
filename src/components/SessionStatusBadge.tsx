import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { SessionRuntimeState } from "../types";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";
import type { NativeThemeColors } from "../themes/types";

type Props = {
  runtime?: SessionRuntimeState;
  active?: boolean;
  compact?: boolean;
};

export function SessionStatusBadge({ runtime, active = false, compact = false }: Props) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!runtime?.running) {
    if (active) {
      return (
        <View style={[styles.badge, styles.openBadge]}>
          <Text style={[styles.badgeText, styles.openBadgeText]}>Open</Text>
        </View>
      );
    }
    return null;
  }

  return (
    <View style={[styles.badge, runtime.blocked ? styles.blockedBadge : styles.runningBadge]}>
      {!compact ? (
        <ActivityIndicator
          color={runtime.blocked ? colors.systemText : colors.success}
          size="small"
        />
      ) : null}
      <Text style={[styles.badgeText, runtime.blocked ? styles.blockedBadgeText : styles.runningBadgeText]}>
        {runtime.blocked ? "Needs input" : "Running"}
      </Text>
    </View>
  );
}

function createStyles(colors: NativeThemeColors) {
  return StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  runningBadge: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.accentStrong,
  },
  blockedBadge: {
    borderColor: colors.destructiveBorder,
    backgroundColor: colors.destructiveSurface,
  },
  openBadge: {
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  runningBadgeText: { color: colors.midground },
  blockedBadgeText: { color: colors.systemText },
  openBadgeText: { color: colors.midgroundFaint },
  });
}

