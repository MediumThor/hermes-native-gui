import { useMemo } from "react";
import { X } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";
import type { NativeThemeColors } from "../themes/types";

type Props = {
  items: string[];
  onRemove?: (index: number) => void;
};

export function PromptQueueStrip({ items, onRemove }: Props) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (items.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Queued follow-ups</Text>
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
      <Text style={styles.hint}>Enter to queue · Press Enter twice (empty) to send the next one now</Text>
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

