import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  basenameFromPath,
  computeDiffStats,
  diffLineKind,
  extractPathFromDiff,
  fileExtensionBadge,
  splitUnifiedDiff,
  type DiffStats,
} from "../diffUtils";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";
import type { NativeThemeColors } from "../themes/types";

type Props = {
  diff: string;
  filename?: string;
  compact?: boolean;
  maxLines?: number;
};

function createStyles(colors: NativeThemeColors) {
  return StyleSheet.create({
    block: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      backgroundColor: colors.surfaceElevated,
      overflow: "hidden",
      alignSelf: "stretch",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flex: 1,
      minWidth: 0,
    },
    badge: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 4,
      paddingHorizontal: 5,
      paddingVertical: 2,
      backgroundColor: colors.background,
    },
    badgeText: {
      color: colors.midgroundMuted,
      fontSize: 10,
      fontWeight: "800",
      fontFamily: "Menlo, monospace",
      letterSpacing: 0.3,
    },
    filename: {
      color: colors.midground,
      fontSize: 12,
      fontWeight: "700",
      fontFamily: "Menlo, monospace",
      flexShrink: 1,
    },
    statsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    statAdded: {
      color: colors.success,
      fontSize: 12,
      fontWeight: "800",
      fontFamily: "Menlo, monospace",
    },
    statRemoved: {
      color: colors.destructiveText,
      fontSize: 12,
      fontWeight: "800",
      fontFamily: "Menlo, monospace",
    },
    body: {
      backgroundColor: colors.background,
    },
    diffLine: {
      color: colors.midgroundFaint,
      fontSize: 11,
      lineHeight: 16,
      fontFamily: "Menlo, monospace",
      paddingHorizontal: 10,
    },
    diffAdd: {
      color: colors.success,
      backgroundColor: colors.accent,
    },
    diffRemove: {
      color: colors.destructiveText,
      backgroundColor: colors.destructiveSurface,
    },
    diffHunk: {
      color: colors.midgroundMuted,
      backgroundColor: colors.surface,
    },
    diffMore: {
      color: colors.midgroundFaint,
      fontSize: 11,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontStyle: "italic",
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
  });
}

function DiffStatsView({ stats, styles }: { stats: DiffStats; styles: ReturnType<typeof createStyles> }) {
  if (stats.added === 0 && stats.removed === 0) return null;
  return (
    <View style={styles.statsRow}>
      {stats.added > 0 ? <Text style={styles.statAdded}>+{stats.added}</Text> : null}
      {stats.removed > 0 ? <Text style={styles.statRemoved}>-{stats.removed}</Text> : null}
    </View>
  );
}

export function DiffBlock({ diff, filename, compact = false, maxLines = 48 }: Props) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const path = filename ?? basenameFromPath(extractPathFromDiff(diff));
  const stats = useMemo(() => computeDiffStats(diff), [diff]);
  const lines = useMemo(() => diff.replace(/\r\n/g, "\n").split("\n"), [diff]);
  const visibleLines = compact ? lines.slice(0, maxLines) : lines;

  return (
    <View style={styles.block}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {path ? (
            <>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{fileExtensionBadge(path)}</Text>
              </View>
              <Text selectable style={styles.filename} numberOfLines={1}>
                {path}
              </Text>
            </>
          ) : (
            <Text selectable style={styles.filename}>Diff</Text>
          )}
        </View>
        <DiffStatsView stats={stats} styles={styles} />
      </View>

      <View style={styles.body}>
        {visibleLines.map((line, index) => {
          const kind = diffLineKind(line);
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
          <Text selectable style={styles.diffMore}>
            +{lines.length - visibleLines.length} more lines
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function DiffBlockList({
  diff,
  filename,
  compact = false,
}: {
  diff: string;
  filename?: string;
  compact?: boolean;
}) {
  const chunks = useMemo(() => splitUnifiedDiff(diff), [diff]);

  if (chunks.length <= 1) {
    return (
      <DiffBlock
        diff={chunks[0]?.diff ?? diff}
        filename={filename ?? chunks[0]?.path}
        compact={compact}
      />
    );
  }

  return (
    <View style={{ gap: 8, alignSelf: "stretch" }}>
      {chunks.map((chunk, index) => (
        <DiffBlock
          // eslint-disable-next-line react/no-array-index-key
          key={`${chunk.path}-${index}`}
          diff={chunk.diff}
          filename={chunk.path}
          compact={compact}
        />
      ))}
    </View>
  );
}
