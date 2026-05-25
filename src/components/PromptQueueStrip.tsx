import { useMemo } from "react";
import { Send, X } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";
import type { NativeThemeColors } from "../themes/types";

type Props = {
  items: string[];
  onRemove?: (index: number) => void;
  onSendNow?: () => void;
  sendingNow?: boolean;
};

export function PromptQueueStrip({ items, onRemove, onSendNow, sendingNow = false }: Props) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (items.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>Follow-ups waiting</Text>
        {onSendNow ? (
          <Pressable
            style={[styles.sendNowButton, sendingNow && styles.sendNowButtonDisabled]}
            onPress={onSendNow}
            disabled={sendingNow}
            accessibilityRole="button"
            accessibilityLabel="Send the next queued message now"
          >
            <Send color={colors.background} size={12} />
            <Text style={styles.sendNowText}>Send now</Text>
          </Pressable>
        ) : null}
      </View>
      {items.map((item, index) => (
        <View key={`${index}-${item.slice(0, 24)}`} style={styles.row}>
          <Text selectable style={styles.text} numberOfLines={3}>
            {item}
          </Text>
          {onRemove ? (
            <Pressable
              style={styles.removeButton}
              onPress={() => onRemove(index)}
              accessibilityRole="button"
              accessibilityLabel="Remove queued message"
            >
              <X color={colors.destructiveText} size={14} />
            </Pressable>
          ) : null}
        </View>
      ))}
      <Text style={styles.hint}>These will send automatically when Hermes is ready. Use Send now to inject the next one into the current turn.</Text>
    </View>
  );
}

function createStyles(colors: NativeThemeColors) {
  return StyleSheet.create({
  wrap: {
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    backgroundColor: colors.surfaceElevated,
  },
  label: {
    color: colors.success,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sendNowButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.success,
  },
  sendNowButtonDisabled: {
    opacity: 0.55,
  },
  sendNowText: {
    color: colors.background,
    fontSize: 11,
    fontWeight: "800",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  text: {
    flex: 1,
    color: colors.midgroundFaint,
    fontSize: 13,
    lineHeight: 19,
  },
  removeButton: {
    padding: 4,
  },
  hint: {
    color: colors.midgroundMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  });
}

