import {
  AlertCircle,
  Brain,
  ChevronDown,
  ChevronRight,
  FilePen,
  FileText,
  GitBranch,
  Search,
  Terminal,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { cursorActivityDisplay, type AgentAction, type CursorActivityIcon } from "../agentActivity";
import { DiffBlockList } from "./DiffBlock";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";
import type { NativeThemeColors } from "../themes/types";

type Props = {
  action: AgentAction;
};

function iconFor(kind: CursorActivityIcon, color: string, size = 14) {
  switch (kind) {
    case "file":
      return <FileText color={color} size={size} />;
    case "edit":
      return <FilePen color={color} size={size} />;
    case "terminal":
      return <Terminal color={color} size={size} />;
    case "search":
      return <Search color={color} size={size} />;
    case "thought":
      return <Brain color={color} size={size} />;
    case "error":
      return <AlertCircle color={color} size={size} />;
    case "delegate":
      return <GitBranch color={color} size={size} />;
    default:
      return <Terminal color={color} size={size} />;
  }
}

function statusColor(colors: NativeThemeColors, status?: AgentAction["status"]) {
  if (status === "error") return colors.destructiveText;
  if (status === "blocked") return colors.warning;
  if (status === "running") return colors.success;
  if (status === "queued") return colors.midgroundMuted;
  return colors.midgroundFaint;
}

function createStyles(colors: NativeThemeColors, accent: string) {
  return StyleSheet.create({
    row: {
      maxWidth: 900,
      alignSelf: "stretch",
      borderWidth: 0,
      borderRadius: 0,
      backgroundColor: "transparent",
      overflow: "hidden",
    },
    rowError: {
      backgroundColor: colors.destructiveSurface,
      borderRadius: 8,
    },
    rowRunning: {},
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 4,
      paddingVertical: 4,
      minHeight: 28,
    },
    iconWrap: {
      width: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    labelWrap: { flex: 1, minWidth: 0, gap: 2 },
    label: {
      color: colors.midground,
      fontSize: 13,
      fontWeight: "600",
      lineHeight: 18,
    },
    labelAccent: {
      color: accent,
      fontFamily: "Menlo, monospace",
      fontWeight: "700",
    },
    detail: {
      color: colors.midgroundFaint,
      fontSize: 12,
      lineHeight: 17,
      fontFamily: "Menlo, monospace",
    },
    statusDot: {
      width: 7,
      height: 7,
      borderRadius: 999,
      marginTop: 1,
    },
    body: {
      borderTopWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 32,
      paddingVertical: 6,
    },
    bodyText: {
      color: colors.midgroundFaint,
      fontSize: 12,
      lineHeight: 18,
    },
    diffStack: {
      gap: 8,
      alignSelf: "stretch",
    },
  });
}

function renderLabel(label: string, accentColor: string, styles: ReturnType<typeof createStyles>) {
  const readMatch = label.match(/^(Read|Edited|Searched)\s+(\S+(?:\.\w+)?)(.*)$/);
  if (!readMatch) {
    return <Text style={styles.label}>{label}</Text>;
  }
  const [, verb, file, rest] = readMatch;
  return (
    <Text style={styles.label}>
      {verb}{" "}
      <Text style={[styles.label, styles.labelAccent, { color: accentColor }]}>{file}</Text>
      {rest ? <Text style={styles.label}>{rest}</Text> : null}
    </Text>
  );
}

export function AgentActivityRow({ action }: Props) {
  const { colors } = useDashboardTheme();
  const display = useMemo(() => cursorActivityDisplay(action), [action]);
  const accent = action.kind === "error" ? colors.destructiveText : colors.highlight;
  const styles = useMemo(() => createStyles(colors, accent), [accent, colors]);
  const [expanded, setExpanded] = useState(false);
  const expandable = Boolean(
    !action.inlineDiff && display.detail && (display.icon === "thought" || display.detail.length > 72),
  );
  const iconColor = statusColor(colors, display.status);

  if (action.inlineDiff) {
    return (
      <View style={[styles.row, styles.diffStack]}>
        <DiffBlockList diff={action.inlineDiff} />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.row,
        action.kind === "error" && styles.rowError,
        display.status === "running" && styles.rowRunning,
      ]}
    >
      <Pressable
        style={styles.header}
        onPress={() => expandable && setExpanded((open) => !open)}
        disabled={!expandable}
      >
        <View style={styles.iconWrap}>
          {expandable ? (
            expanded ? (
              <ChevronDown color={colors.midgroundFaint} size={14} />
            ) : (
              <ChevronRight color={colors.midgroundFaint} size={14} />
            )
          ) : (
            iconFor(display.icon, iconColor)
          )}
        </View>
        <View style={styles.labelWrap}>
          {renderLabel(display.label, accent, styles)}
          {!expanded && display.detail && !expandable ? (
            <Text selectable style={styles.detail} numberOfLines={2}>
              {display.detail}
            </Text>
          ) : null}
        </View>
        {display.status === "running" ? (
          <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
        ) : null}
      </Pressable>

      {expanded && display.detail ? (
        <View style={styles.body}>
          <Text selectable style={styles.bodyText}>{display.detail}</Text>
        </View>
      ) : null}
    </View>
  );
}
