import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";
import type { NativeThemeColors } from "../themes/types";
import { StreamingDots } from "./StreamingDots";

type Props = {
  title?: string;
  streaming?: boolean;
  reasoning?: string;
  responseText?: string;
  placeholder?: string;
  defaultOpen?: boolean;
  autoOpenOnReasoning?: boolean;
  autoCollapseOnResponse?: boolean;
};

function createStyles(colors: NativeThemeColors) {
  return StyleSheet.create({
    wrap: { gap: 10, marginBottom: 10 },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    headerTitle: {
      color: colors.success,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.4,
    },
    toggle: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: colors.surfaceElevated,
    },
    toggleOpen: {
      borderColor: colors.borderStrong,
      backgroundColor: colors.accent,
    },
    toggleText: {
      color: colors.midgroundFaint,
      fontSize: 12,
      fontWeight: "700",
    },
    panel: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.surface,
      overflow: "hidden",
      maxHeight: 280,
    },
    scroll: { maxHeight: 280 },
    scrollContent: { padding: 12 },
    reasoningText: {
      color: colors.midgroundFaint,
      fontSize: 13,
      lineHeight: 20,
    },
    placeholder: {
      color: colors.midgroundMuted,
      fontSize: 12,
      lineHeight: 18,
      fontStyle: "italic",
      padding: 12,
    },
    dotsRow: { marginTop: 2 },
  });
}

export function ReasoningDropdown({
  title = "Assistant",
  streaming = false,
  reasoning,
  responseText,
  placeholder = "Hermes will show its thinking here while it works…",
  defaultOpen = false,
  autoOpenOnReasoning = true,
  autoCollapseOnResponse = true,
}: Props) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(defaultOpen);
  const hasReasoning = Boolean(reasoning?.trim());
  const hasResponse = Boolean(responseText?.trim());

  useEffect(() => {
    if (autoOpenOnReasoning && streaming && !hasResponse) {
      setOpen(true);
    }
  }, [autoOpenOnReasoning, hasResponse, streaming]);

  useEffect(() => {
    if (autoCollapseOnResponse && hasResponse) {
      setOpen(false);
    }
  }, [autoCollapseOnResponse, hasResponse]);

  if (!streaming && !hasReasoning) return null;

  const statusLabel = streaming ? "Streaming" : "Reasoning";

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>
          {title.toUpperCase()} · {statusLabel.toUpperCase()}
        </Text>
      </View>

      <Pressable
        style={[styles.toggle, open && styles.toggleOpen]}
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.toggleText}>{open ? "Hide reasoning" : "Show reasoning"}</Text>
        {open ? (
          <ChevronUp color={colors.midgroundFaint} size={14} />
        ) : (
          <ChevronDown color={colors.midgroundFaint} size={14} />
        )}
      </Pressable>

      {open ? (
        <View style={styles.panel}>
          {hasReasoning ? (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              <Text selectable style={styles.reasoningText}>
                {reasoning}
              </Text>
            </ScrollView>
          ) : (
            <Text selectable style={styles.placeholder}>{placeholder}</Text>
          )}
        </View>
      ) : null}

      {streaming && !hasResponse ? (
        <View style={styles.dotsRow}>
          <StreamingDots active color={colors.success} />
        </View>
      ) : null}
    </View>
  );
}
