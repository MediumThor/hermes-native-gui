import type { RefObject, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { groupTranscriptMessages } from "../chatMessageGroups";
import type { ChatMessage } from "../types";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";
import type { NativeThemeColors } from "../themes/types";
import { AgentTurnView } from "./AgentTurnView";
import { MessageBubble } from "./MessageBubble";

type Props = {
  messages: ChatMessage[];
  scrollRef?: RefObject<ScrollView | null>;
  emptyState?: ReactNode;
  /** Changes when the active session changes — transcript jumps to the latest messages. */
  scrollKey?: string | null;
};

const NEAR_BOTTOM_PX = 96;

function createStyles(colors: NativeThemeColors) {
  return StyleSheet.create({
    transcript: { flex: 1 },
    transcriptContent: { padding: 24, paddingBottom: 40, gap: 10, maxWidth: 960, width: "100%", alignSelf: "center" },
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

function transcriptTailSignature(messages: ChatMessage[]) {
  return messages
    .map((message) => `${message.id}:${message.status ?? ""}:${message.text?.length ?? 0}:${message.reasoning?.length ?? 0}`)
    .join("|");
}

function shouldFollowTranscriptTail(messages: ChatMessage[]) {
  if (messages.length === 0) return false;
  const last = messages[messages.length - 1];
  if (last.status === "streaming") return true;
  if (last.role === "user" || last.role === "system") return true;
  return false;
}

export function ChatTranscript({ messages, scrollRef, emptyState, scrollKey }: Props) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const internalRef = useRef<ScrollView | null>(null);
  const ref = scrollRef ?? internalRef;
  const jumpToBottomRef = useRef(false);
  const pinnedToBottomRef = useRef(true);

  const tailSignature = useMemo(() => transcriptTailSignature(messages), [messages]);
  const followTail = useMemo(() => shouldFollowTranscriptTail(messages), [messages]);
  const displayGroups = useMemo(
    () => groupTranscriptMessages(messages),
    [messages],
  );

  const scrollToBottom = useCallback((animated: boolean) => {
    ref.current?.scrollToEnd({ animated });
  }, [ref]);

  useEffect(() => {
    jumpToBottomRef.current = true;
    pinnedToBottomRef.current = true;
  }, [scrollKey]);

  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role === "user") {
      pinnedToBottomRef.current = true;
    }
  }, [messages]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    if (layoutMeasurement.height <= 0) return;

    const wasPinned = pinnedToBottomRef.current;
    if (contentSize.height <= layoutMeasurement.height) {
      pinnedToBottomRef.current = true;
      return;
    }

    const distanceFromBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
    pinnedToBottomRef.current = distanceFromBottom <= NEAR_BOTTOM_PX;

    if (!wasPinned && pinnedToBottomRef.current && shouldFollowTranscriptTail(messages)) {
      scrollToBottom(true);
    }
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (messages.length === 0) return;

    const sessionSwitch = jumpToBottomRef.current;
    if (sessionSwitch || (followTail && pinnedToBottomRef.current)) {
      // Streaming tokens can update this effect many times per second.
      // Repeated animated scrollToEnd calls fight each other on web and make
      // the transcript look like it is bouncing, so live tail-following is
      // immediate while session switches still jump cleanly to the bottom.
      scrollToBottom(false);
    }

    if (!sessionSwitch) return undefined;

    const timers = [0, 50, 150, 300, 600].map((delay) =>
      setTimeout(() => scrollToBottom(false), delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [followTail, messages.length, scrollKey, scrollToBottom, tailSignature]);

  const handleContentSizeChange = useCallback(() => {
    if (messages.length === 0) return;
    if (jumpToBottomRef.current || (followTail && pinnedToBottomRef.current)) {
      scrollToBottom(false);
      if (jumpToBottomRef.current) jumpToBottomRef.current = false;
    }
  }, [followTail, messages.length, scrollToBottom]);

  return (
    <ScrollView
      ref={ref}
      style={styles.transcript}
      contentContainerStyle={styles.transcriptContent}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      onContentSizeChange={handleContentSizeChange}
    >
      {displayGroups.length === 0
        ? emptyState
        : displayGroups.map((group) =>
            group.type === "agentTurn" ? (
              <AgentTurnView key={group.id} turn={group.turn} />
            ) : (
              <MessageBubble key={group.id} message={group.message} />
            ),
          )}
    </ScrollView>
  );
}

export function DefaultEmptyTranscript({ connected = false }: { connected?: boolean }) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.emptyState}>
      <Text selectable style={styles.emptyTitle}>Open Sessions to pick a chat</Text>
      <Text selectable style={styles.emptyText}>
        Use Sessions in the main menu to resume a recent conversation, or start a new chat. Messages appear here once you open a session.
      </Text>
      <Text selectable style={styles.emptyCode}>
        {connected
          ? "Connected."
          : `Start the bridge with: npm run bridge\nThen click Connect.`}
      </Text>
    </View>
  );
}
