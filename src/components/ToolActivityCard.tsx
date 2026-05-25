import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ToolActivity } from "../types";
import { toolActivityDisplay } from "../toolActivityDisplay";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";
import type { NativeThemeColors } from "../themes/types";
import { DiffBlockList } from "./DiffBlock";

type Props = {
  tool: ToolActivity;
  compact?: boolean;
};

export function ToolActivityCard({ tool, compact = false }: Props) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);
  const display = useMemo(() => toolActivityDisplay(tool), [tool]);
  const rawPayload = tool.rawPayload ? JSON.stringify(tool.rawPayload, null, 2) : null;
  const hasDetails = Boolean(tool.preview || tool.result || tool.summary || tool.inlineDiff || rawPayload || tool.error);

  return (
    <View style={[styles.card, tool.status === "error" && styles.cardError]}>
      <View style={styles.headerRow}>
        <Text selectable style={styles.name}>{display.title}</Text>
        <Text selectable style={styles.status}>
          {display.statusText}
        </Text>
      </View>

      {display.preview ? (
        <Text selectable style={styles.preview} numberOfLines={compact && !expanded ? 5 : undefined}>
          {display.preview}
        </Text>
      ) : null}

      {tool.summary ? (
        <Text selectable style={styles.summary} numberOfLines={compact && !expanded ? 4 : undefined}>
          {tool.summary}
        </Text>
      ) : null}

      {tool.inlineDiff ? (
        <DiffBlockList diff={tool.inlineDiff} compact={compact && !expanded} />
      ) : null}

      {tool.result && !tool.inlineDiff ? (
        <Text selectable style={styles.result} numberOfLines={compact && !expanded ? 5 : undefined}>
          {String(tool.result)}
        </Text>
      ) : null}

      {tool.error ? (
        <Text selectable style={styles.errorText}>{tool.error}</Text>
      ) : null}

      {hasDetails && rawPayload ? (
        <Pressable style={styles.expandButton} onPress={() => setExpanded((open) => !open)}>
          {expanded ? <ChevronUp color={colors.success} size={14} /> : <ChevronDown color={colors.success} size={14} />}
          <Text style={styles.expandText}>{expanded ? "Hide raw payload" : "Show raw payload"}</Text>
        </Pressable>
      ) : null}

      {expanded && rawPayload ? (
        <Text selectable style={styles.rawPayload}>{rawPayload}</Text>
      ) : null}
    </View>
  );
}

function createStyles(colors: NativeThemeColors) {
  return StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    backgroundColor: colors.surfaceElevated,
    gap: 6,
  },
  cardError: { borderColor: colors.destructiveBorder, backgroundColor: colors.destructiveSurface },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  name: { color: colors.success, fontWeight: "800", flex: 1 },
  status: { color: colors.midgroundFaint, textTransform: "capitalize" },
  preview: { color: colors.midgroundFaint, fontSize: 12, lineHeight: 18 },
  summary: { color: colors.midground, fontSize: 12, lineHeight: 18, fontWeight: "700" },
  result: { color: colors.midgroundFaint, fontSize: 12, lineHeight: 18 },
  errorText: { color: colors.destructiveText, fontSize: 12, lineHeight: 18 },
  expandButton: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  expandText: { color: colors.success, fontSize: 11, fontWeight: "700" },
  rawPayload: {
    color: colors.midgroundFaint,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "Menlo, monospace",
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 8,
  },
  });
}
