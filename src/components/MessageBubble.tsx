import { Copy } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { ChatMessage } from "../types";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";
import type { NativeThemeColors } from "../themes/types";
import { MarkdownMessage } from "./MarkdownMessage";
import { ReasoningDropdown } from "./ReasoningDropdown";
import { StreamingDots } from "./StreamingDots";

type Props = {
  message: ChatMessage;
};

async function copyText(text: string) {
  if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  throw new Error("Copy is only supported on web in this build.");
}

function createStyles(colors: NativeThemeColors) {
  return StyleSheet.create({
    bubble: {
      maxWidth: 900,
      alignSelf: "stretch",
      gap: 8,
    },
    userBubble: {
      alignSelf: "flex-end",
      maxWidth: 760,
      backgroundColor: colors.userBubble,
      borderWidth: 1,
      borderColor: colors.userBubbleBorder,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    assistantBubble: {
      paddingVertical: 2,
    },
    systemBubble: {
      borderWidth: 1,
      borderColor: colors.systemBorder,
      borderRadius: 12,
      backgroundColor: colors.systemSurface,
      padding: 12,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 8,
    },
    copyButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    copyText: { color: colors.midgroundFaint, fontSize: 11, fontWeight: "700" },
    responseBlock: { gap: 8 },
    messageText: {
      color: colors.midground,
      fontSize: 15,
      lineHeight: 23,
      userSelect: "text" as any,
    },
    userText: { color: colors.midground, fontSize: 15, lineHeight: 22 },
    systemText: { color: colors.systemText, fontSize: 13, lineHeight: 20 },
    streamingHint: {
      color: colors.midgroundFaint,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.3,
      textTransform: "uppercase",
    },
  });
}

export function MessageBubble({ message }: Props) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const isAssistant = message.role === "assistant";
  const isStreaming = message.status === "streaming";
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);

  const showCopy = Platform.OS === "web" && message.text && (hovered || copied);
  const showReasoning = isAssistant && (isStreaming || Boolean(message.reasoning?.trim()));

  const handleCopy = async () => {
    try {
      await copyText(message.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Ignore clipboard failures.
    }
  };

  return (
    <View
      style={[
        styles.bubble,
        isUser && styles.userBubble,
        isAssistant && styles.assistantBubble,
        isSystem && styles.systemBubble,
      ]}
      {...(Platform.OS === "web"
        ? {
            onMouseEnter: () => setHovered(true),
            onMouseLeave: () => setHovered(false),
          }
        : {})}
    >
      {isAssistant && isStreaming && !showReasoning ? (
        <Text style={styles.streamingHint}>Responding</Text>
      ) : null}

      {showCopy ? (
        <View style={styles.headerRow}>
          <Pressable style={styles.copyButton} onPress={() => void handleCopy()} accessibilityRole="button">
            <Copy color={colors.midgroundFaint} size={14} />
            <Text style={styles.copyText}>{copied ? "Copied" : "Copy"}</Text>
          </Pressable>
        </View>
      ) : null}

      {showReasoning ? (
        <ReasoningDropdown
          title="Thought"
          streaming={isStreaming}
          reasoning={message.reasoning}
          responseText={message.text}
        />
      ) : null}

      {isAssistant && message.text ? (
        <View style={styles.responseBlock}>
          <MarkdownMessage text={message.text} />
          {isStreaming ? <StreamingDots active color={colors.success} /> : null}
        </View>
      ) : isStreaming && !showReasoning ? (
        <StreamingDots active color={colors.success} />
      ) : (
        <Text selectable style={[styles.messageText, isUser && styles.userText, isSystem && styles.systemText]}>
          {message.text}
        </Text>
      )}
    </View>
  );
}
