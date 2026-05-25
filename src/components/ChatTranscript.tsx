import type { RefObject, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { ChatMessage } from "../types";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";
import type { NativeThemeColors } from "../themes/types";
import { MessageBubble } from "./MessageBubble";

type Props = {
  messages: ChatMessage[];
  scrollRef?: RefObject<ScrollView | null>;
  emptyState?: ReactNode;
  /** Changes when the active session changes — transcript jumps to the latest messages. */
  scrollKey?: string | null;
};

function createStyles(colors: NativeThemeColors) {
  return StyleSheet.create({
    transcript: { flex: 1 },
    transcriptContent: { padding: 24, gap: 14 },
    emptyState: {
      marginTop: 24,
      maxWidth: 720,
      alignSelf: "center",
      gap: 14,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 20,
      backgroundColor: colors.surfaceElevated,
    },
    emptyTitle: { color: colors.midground, fontSize: 24, fontWeight: "800" },
    emptyText: { color: colors.midgroundFaint, fontSize: 16, lineHeight: 24 },
    emptyCode: {
      color: colors.success,
      fontFamily: "Menlo, monospace",
      backgroundColor: colors.background,
      padding: 12,
      borderRadius: 10,
    },
  });
}

export function ChatTranscript({ messages, scrollRef, emptyState, scrollKey }: Props) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const internalRef = useRef<ScrollView | null>(null);
  const ref = scrollRef ?? internalRef;
  const jumpToBottomRef = useRef(false);
  const lastMessageCountRef = useRef(0);

  const scrollToBottom = useCallback((animated: boolean) => {
    ref.current?.scrollToEnd({ animated });
  }, [ref]);

  useEffect(() => {
    jumpToBottomRef.current = true;
    lastMessageCountRef.current = 0;
  }, [scrollKey]);

  useEffect(() => {
    const count = messages.length;
    if (count === 0) return;

    const sessionSwitch = jumpToBottomRef.current;
    const animated = !sessionSwitch && count > lastMessageCountRef.current;
    lastMessageCountRef.current = count;

    scrollToBottom(sessionSwitch ? false : animated);

    if (!sessionSwitch) return undefined;

    const timers = [0, 50, 150, 300].map((delay) =>
      setTimeout(() => scrollToBottom(false), delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [messages, scrollKey, scrollToBottom]);

  const handleContentSizeChange = useCallback(() => {
    if (!jumpToBottomRef.current || messages.length === 0) return;
    scrollToBottom(false);
    jumpToBottomRef.current = false;
  }, [messages.length, scrollToBottom]);

  return (
    <ScrollView
      ref={ref}
      style={styles.transcript}
      contentContainerStyle={styles.transcriptContent}
      onContentSizeChange={handleContentSizeChange}
    >
      {messages.length === 0
        ? emptyState
        : messages.map((message) => <MessageBubble key={message.id} message={message} />)}
    </ScrollView>
  );
}

export function DefaultEmptyTranscript() {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.emptyState}>
      <Text selectable style={styles.emptyTitle}>Open Sessions to pick a chat</Text>
      <Text selectable style={styles.emptyText}>
        Use Sessions in the main menu to resume a recent conversation, or start a new chat. Messages appear here once you open a session.
      </Text>
      <Text selectable style={styles.emptyCode}>
        Start the bridge with: npm run bridge{"\n"}
        Then click Connect.
      </Text>
    </View>
  );
}
