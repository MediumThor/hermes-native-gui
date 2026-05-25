import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ToolActivity } from "../types";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";
import type { NativeThemeColors } from "../themes/types";

type Props = {
  tool: ToolActivity;
  compact?: boolean;
};

function formatDuration(startedAt?: number, completedAt?: number): string | null {
  if (!startedAt || !completedAt || completedAt < startedAt) return null;
  const ms = completedAt - startedAt;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function DiffViewer({ text, compact }: { text: string; compact: boolean }) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const lines = text.split("\n");
  const visibleLines = compact ? lines.slice(0, 48) : lines;
  return (
    <View style={styles.diffBox}>
      <Text selectable style={styles.diffTitle}>Inline diff</Text>
      {visibleLines.map((line, index) => {
        const kind = line.startsWith("+") && !line.startsWith("+++")
          ? "add"
          : line.startsWith("-") && !line.startsWith("---")
            ? "remove"
            : line.startsWith("@@")
              ? "hunk"
              : "context";
        return (
          <Text
            // eslint-disable-next-line react/no-array-index-key
            key={`${index}-${line.slice(0, 16)}`}
            selectable
            style={[
              styles.diffLine,
              kind === "add" && styles.diffAdd,
              kind === "remove" && styles.diffRemove,
              kind === "hunk" && styles.diffHunk,
            ]}
          >
            {line || " "}
          </Text>
        );
      })}
      {visibleLines.length < lines.length ? (
        <Text selectable style={styles.diffMore}>+{lines.length - visibleLines.length} more diff lines — expand to view all.</Text>
      ) : null}
    </View>
  );
}

export function ToolActivityCard({ tool, compact = false }: Props) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);
  const duration = useMemo(
    () => formatDuration(tool.startedAt, tool.completedAt),
    [tool.completedAt, tool.startedAt],
  );
  const rawPayload = tool.rawPayload ? JSON.stringify(tool.rawPayload, null, 2) : null;
  const hasDetails = Boolean(tool.preview || tool.result || tool.summary || tool.inlineDiff || rawPayload || tool.error);

  return (
    <View style={[styles.card, tool.status === "error" && styles.cardError]}>
      <View style={styles.headerRow}>
        <Text selectable style={styles.name}>{tool.name}</Text>
        <Text selectable style={styles.status}>
          {tool.status}
          {duration ? ` · ${duration}` : ""}
        </Text>
      </View>

      {tool.preview ? (
        <Text selectable style={styles.preview} numberOfLines={compact && !expanded ? 5 : undefined}>
          {String(tool.preview)}
        </Text>
      ) : null}

      {tool.summary ? (
        <Text selectable style={styles.summary} numberOfLines={compact && !expanded ? 4 : undefined}>
          {tool.summary}
        </Text>
      ) : null}

      {tool.inlineDiff ? (
        <DiffViewer text={tool.inlineDiff} compact={compact && !expanded} />
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
  diffBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.background,
    overflow: "hidden",
  },
  diffTitle: {
    color: colors.success,
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  diffLine: {
    color: colors.midgroundFaint,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "Menlo, monospace",
    paddingHorizontal: 10,
  },
  diffAdd: { color: colors.success, backgroundColor: colors.accent },
  diffRemove: { color: colors.destructiveText, backgroundColor: colors.destructiveSurface },
  diffHunk: { color: colors.midgroundFaint, backgroundColor: colors.accent },
  diffMore: { color: colors.midgroundFaint, fontSize: 11, padding: 10, fontStyle: "italic" },
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

