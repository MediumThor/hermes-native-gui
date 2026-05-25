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
      alignSelf: "flex-start",
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 16,
    },
    userBubble: { alignSelf: "flex-end", backgroundColor: colors.userBubble, borderColor: colors.userBubbleBorder },
    systemBubble: { backgroundColor: colors.systemSurface, borderColor: colors.systemBorder },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    headerSpacer: { flex: 1 },
    role: {
      color: colors.success,
      fontSize: 12,
      fontWeight: "800",
      textTransform: "uppercase",
      marginBottom: 8,
      flex: 1,
    },
    userRole: { color: colors.highlight },
    systemRole: { color: colors.systemText },
    copyButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginBottom: 8,
    },
    copyText: { color: colors.success, fontSize: 11, fontWeight: "700" },
    messageText: { color: colors.midground, fontSize: 15, lineHeight: 22, userSelect: "text" as any },
    userText: { color: colors.midground },
    systemText: { color: colors.systemText },
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
      style={[styles.bubble, isUser && styles.userBubble, isSystem && styles.systemBubble]}
      {...(Platform.OS === "web"
        ? {
            onMouseEnter: () => setHovered(true),
            onMouseLeave: () => setHovered(false),
          }
        : {})}
    >
      {!(isAssistant && showReasoning) ? (
        <View style={styles.headerRow}>
          <Text selectable style={[styles.role, isUser && styles.userRole, isSystem && styles.systemRole]}>
            {message.role}
            {isStreaming ? " · streaming" : message.status === "interrupted" ? " · interrupted" : ""}
          </Text>
          {showCopy ? (
            <Pressable style={styles.copyButton} onPress={() => void handleCopy()} accessibilityRole="button">
              <Copy color={colors.success} size={14} />
              <Text style={styles.copyText}>{copied ? "Copied" : "Copy"}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : showCopy ? (
        <View style={styles.headerRow}>
          <View style={styles.headerSpacer} />
          <Pressable style={styles.copyButton} onPress={() => void handleCopy()} accessibilityRole="button">
            <Copy color={colors.success} size={14} />
            <Text style={styles.copyText}>{copied ? "Copied" : "Copy"}</Text>
          </Pressable>
        </View>
      ) : null}

      {showReasoning ? (
        <ReasoningDropdown
          title="Assistant"
          streaming={isStreaming}
          reasoning={message.reasoning}
        />
      ) : null}

      {isStreaming && !message.text && !showReasoning ? (
        <StreamingDots active color={colors.success} />
      ) : isAssistant && !isStreaming && message.text ? (
        <MarkdownMessage text={message.text} />
      ) : (
        <Text selectable style={[styles.messageText, isUser && styles.userText, isSystem && styles.systemText]}>
          {message.text}
        </Text>
      )}
    </View>
  );
}
