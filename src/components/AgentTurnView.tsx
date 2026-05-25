import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { AgentTurn } from "../chatMessageGroups";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";
import type { NativeThemeColors } from "../themes/types";
import { AgentActivityRow } from "./AgentActivityRow";
import { MessageBubble } from "./MessageBubble";
import { StreamingDots } from "./StreamingDots";

type Props = {
  turn: AgentTurn;
};

function createStyles(colors: NativeThemeColors) {
  return StyleSheet.create({
    turn: { gap: 8, alignSelf: "stretch", maxWidth: 900 },
    thought: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 6,
    },
    thoughtLabel: {
      color: colors.midgroundMuted,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },
    thoughtText: {
      color: colors.midgroundFaint,
      fontSize: 13,
      lineHeight: 20,
      fontStyle: "italic",
    },
  });
}

export function ThoughtStream({
  text,
  streaming = false,
}: {
  text: string;
  streaming?: boolean;
}) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const trimmed = text.trim();

  if (!trimmed && !streaming) return null;

  return (
    <View style={styles.thought}>
      <Text style={styles.thoughtLabel}>Thought</Text>
      <Text selectable style={styles.thoughtText}>
        {trimmed || "…"}
      </Text>
      {streaming ? <StreamingDots active color={colors.success} /> : null}
    </View>
  );
}

export function AgentTurnView({ turn }: Props) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.turn}>
      {turn.segments.map((segment) => {
        if (segment.type === "thought") {
          return (
            <ThoughtStream
              key={segment.id}
              text={segment.text}
              streaming={segment.streaming}
            />
          );
        }
        if (segment.type === "activity") {
          return <AgentActivityRow key={segment.id} action={segment.action} />;
        }
        return <MessageBubble key={segment.id} message={segment.message} />;
      })}
    </View>
  );
}
