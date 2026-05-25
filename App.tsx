import { StatusBar } from "expo-status-bar";
import { Activity, History, Menu, MessageSquare, Plus, Send, Settings, Square, Wifi, WifiOff, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useHermesRpc } from "./src/useHermesRpc";
import { useAppSettings } from "./src/useAppSettings";
import type { ChatMessage } from "./src/types";
import { BlockingOverlays } from "./src/components/BlockingOverlays";

const MAIN_MENU_WIDTH = 304;

type Pane = "chat" | "sessions" | "activity" | "settings";

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  return (
    <View style={[styles.bubble, isUser && styles.userBubble, isSystem && styles.systemBubble]}>
      <Text selectable style={[styles.role, isUser && styles.userRole, isSystem && styles.systemRole]}>
        {message.role}
        {message.status === "streaming" ? " · streaming" : message.status === "interrupted" ? " · interrupted" : ""}
      </Text>
      <Text selectable style={[styles.messageText, isUser && styles.userText, isSystem && styles.systemText]}>
        {message.text || (message.status === "streaming" ? "…" : "")}
      </Text>
    </View>
  );
}

export default function App() {
  const hermes = useHermesRpc();
  const settings = useAppSettings();
  const [draft, setDraft] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activePane, setActivePane] = useState<Pane>("chat");
  const scrollRef = useRef<ScrollView | null>(null);
  const drawerProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const handle = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(handle);
  }, [hermes.messages.length, activePane]);

  useEffect(() => {
    Animated.timing(drawerProgress, {
      toValue: drawerOpen ? 1 : 0,
      duration: drawerOpen ? 220 : 180,
      useNativeDriver: false,
    }).start();
  }, [drawerOpen, drawerProgress]);

  const drawerTranslate = drawerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-MAIN_MENU_WIDTH, 0],
  });

  const contentMarginLeft = drawerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, MAIN_MENU_WIDTH],
  });

  const submit = async () => {
    const text = draft.trim();
    if (!text || hermes.busy || hermes.isBlocked) return;
    setDraft("");
    try {
      await hermes.sendPrompt(text);
    } catch (error: any) {
      setDraft(text);
      console.warn(error?.message ?? error);
    }
  };

  const runSafely = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (error: any) {
      console.warn(error?.message ?? error);
    }
  };

  const stopTurn = async () => {
    if (!hermes.connected || (!hermes.busy && !hermes.isBlocked)) return;
    try {
      await hermes.interruptSession();
    } catch (error: any) {
      console.warn(error?.message ?? error);
    }
  };

  const composerAction = async () => {
    if (hermes.busy || hermes.isBlocked) {
      await stopTurn();
      return;
    }
    await submit();
  };

  const canSwitchSessions =
    (!hermes.busy && !hermes.isBlocked) || settings.interruptOnNewChat;
  const newChatDisabled = !hermes.connected || !canSwitchSessions;
  const resumeDisabled = !hermes.connected || !canSwitchSessions;

  const switchSession = async (action: () => Promise<unknown>) => {
    if ((hermes.busy || hermes.isBlocked) && settings.interruptOnNewChat) {
      await stopTurn();
    }
    await runSafely(action);
  };

  const selectPane = (pane: Pane) => {
    setActivePane(pane);
    if (pane === "sessions" && hermes.connected) {
      void runSafely(hermes.refreshSessions);
    }
  };

  const startNewChat = () => {
    setActivePane("chat");
    void switchSession(hermes.createSession);
  };

  const paneTitle = {
    chat: "Chat",
    sessions: "Sessions",
    activity: "Activity",
    settings: "Settings",
  }[activePane];

  const paneSubtitle = {
    chat: "A normal chat surface with selectable React Native text.",
    sessions: "Browse and resume recent Hermes sessions.",
    activity: "Inspect tool calls and runtime activity.",
    settings: "Configure bridge connection and session behavior.",
  }[activePane];

  const menuItemStyle = (pane: Pane) => [
    styles.menuItem,
    activePane === pane && styles.menuItemActive,
  ];

  const renderChatPane = () => (
    <View style={styles.chatPane}>
      <View style={styles.chatMain}>
        <ScrollView ref={scrollRef} style={styles.transcript} contentContainerStyle={styles.transcriptContent}>
          {hermes.messages.length === 0 ? (
            <View style={styles.emptyState}>
              <Text selectable style={styles.emptyTitle}>A normal chat surface.</Text>
              <Text selectable style={styles.emptyText}>
                This is React Native text, not xterm. You can scroll normally and select/copy whole paragraphs.
              </Text>
              <Text selectable style={styles.emptyCode}>
                Start the bridge with: npm run bridge{"\n"}
                Then click Connect.
              </Text>
            </View>
          ) : (
            hermes.messages.map((m) => <MessageBubble key={m.id} message={m} />)
          )}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            multiline
            value={draft}
            onChangeText={setDraft}
            placeholder={
              hermes.isBlocked
                ? "Respond to the prompt above…"
                : hermes.connected
                  ? "Ask Hermes…"
                  : "Connect to the bridge first…"
            }
            placeholderTextColor="#7f9292"
            editable={hermes.connected && !hermes.busy && !hermes.isBlocked}
            onKeyPress={(event) => {
              if (Platform.OS !== "web") return;

              const native = event.nativeEvent as any;
              if (native.key !== "Enter") return;

              // Plain Enter sends the message. Shift+Enter keeps multiline input.
              if (!native.shiftKey && !native.metaKey && !native.ctrlKey && !native.altKey) {
                event.preventDefault?.();
                submit();
              }
            }}
          />
          <Pressable
            style={[
              styles.sendButton,
              hermes.busy || hermes.isBlocked
                ? styles.stopButton
                : (!hermes.connected || !draft.trim()) && styles.sendDisabled,
            ]}
            disabled={
              !hermes.connected ||
              (!(hermes.busy || hermes.isBlocked) && !draft.trim())
            }
            onPress={composerAction}
          >
            {hermes.busy || hermes.isBlocked ? (
              <Square color="#f7d6d6" size={18} />
            ) : (
              <Send color="#081111" size={18} />
            )}
            <Text style={[styles.sendText, (hermes.busy || hermes.isBlocked) && styles.stopText]}>
              {hermes.busy || hermes.isBlocked ? "Stop" : "Send"}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.activitySidebar}>
        {renderActivityFeed("compact")}
      </View>
    </View>
  );

  const renderSessionsPane = () => (
    <ScrollView style={styles.fullPane} contentContainerStyle={styles.fullPaneContent}>
      <View style={styles.panelHeaderRow}>
        <View>
          <Text selectable style={styles.sectionTitle}>Recent sessions</Text>
          <Text selectable style={styles.sectionSubtitle}>{hermes.sessions.length} loaded</Text>
        </View>
        <Pressable
          style={[styles.secondaryButton, !hermes.connected && styles.sendDisabled]}
          onPress={() => runSafely(hermes.refreshSessions)}
          disabled={!hermes.connected}
        >
          <Text style={styles.secondaryText}>Refresh</Text>
        </Pressable>
      </View>

      {hermes.sessions.length === 0 ? (
        <View style={styles.emptyState}>
          <Text selectable style={styles.emptyTitle}>No sessions loaded yet.</Text>
          <Text selectable style={styles.emptyText}>Connect to the bridge, then refresh sessions to browse recent chats.</Text>
        </View>
      ) : (
        hermes.sessions.map((session) => (
          <Pressable
            key={session.id}
            style={styles.sessionCard}
            onPress={() => {
              setActivePane("chat");
              void switchSession(() => hermes.resumeSession(session.id));
            }}
            disabled={resumeDisabled}
          >
            <Text selectable style={styles.sessionTitle} numberOfLines={1}>
              {session.title || session.id}
            </Text>
            <Text selectable style={styles.sessionMeta}>
              {session.message_count} messages · {session.source || "session"}
            </Text>
            {session.preview ? (
              <Text selectable style={styles.sessionPreview} numberOfLines={3}>
                {session.preview}
              </Text>
            ) : null}
          </Pressable>
        ))
      )}
    </ScrollView>
  );

  const renderActivityFeed = (mode: "full" | "compact" = "full") => {
    const compact = mode === "compact";
    return (
      <View style={compact ? styles.activityFeedCompact : styles.activityFeedFull}>
        <Text selectable style={styles.sectionTitle}>Tool activity</Text>
        <Text selectable style={styles.sectionSubtitle}>{hermes.tools.length} recent tool calls</Text>
        {hermes.tools.length === 0 ? (
          <View style={compact ? styles.compactEmptyState : styles.emptyState}>
            <Text selectable style={compact ? styles.compactEmptyTitle : styles.emptyTitle}>Nothing running yet.</Text>
            <Text selectable style={compact ? styles.compactEmptyText : styles.emptyText}>Tool calls, progress, and results will appear here while Hermes works.</Text>
          </View>
        ) : (
          hermes.tools.map((tool) => (
            <View key={tool.id} style={styles.toolCard}>
              <Text selectable style={styles.toolName}>{tool.name}</Text>
              <Text selectable style={styles.toolStatus}>{tool.status}</Text>
              {tool.preview ? <Text selectable style={styles.toolPreview} numberOfLines={compact ? 5 : undefined}>{String(tool.preview)}</Text> : null}
              {tool.result ? <Text selectable style={styles.toolPreview} numberOfLines={compact ? 5 : undefined}>{String(tool.result)}</Text> : null}
            </View>
          ))
        )}
      </View>
    );
  };

  const renderActivityPane = () => (
    <ScrollView style={styles.fullPane} contentContainerStyle={styles.fullPaneContent}>
      {renderActivityFeed("full")}
    </ScrollView>
  );

  const renderSettingsPane = () => (
    <ScrollView style={styles.fullPane} contentContainerStyle={styles.fullPaneContent}>
      <View style={styles.settingsCard}>
        <Text selectable style={styles.sectionTitle}>Session behavior</Text>
        <Text selectable style={styles.sectionSubtitle}>Single active session with optional interrupt before switching.</Text>
        <Pressable
          style={styles.settingRow}
          onPress={() => settings.setInterruptOnNewChat(!settings.interruptOnNewChat)}
          accessibilityRole="switch"
          accessibilityState={{ checked: settings.interruptOnNewChat }}
        >
          <View style={styles.settingRowText}>
            <Text style={styles.settingRowTitle}>Interrupt before switching</Text>
            <Text selectable style={styles.settingHelp}>
              Stop the running reply before starting a new chat or resuming another session. When off, wait for the turn to finish or press Stop.
            </Text>
          </View>
          <View style={[styles.toggle, settings.interruptOnNewChat && styles.toggleOn]}>
            <View style={[styles.toggleKnob, settings.interruptOnNewChat && styles.toggleKnobOn]} />
          </View>
        </Pressable>
      </View>

      <View style={styles.settingsCard}>
        <Text selectable style={styles.sectionTitle}>Bridge WebSocket</Text>
        <Text selectable style={styles.sectionSubtitle}>Local bridge endpoint used by the native GUI.</Text>
        <TextInput
          style={styles.urlInput}
          value={hermes.url}
          onChangeText={hermes.setUrl}
          editable={!hermes.connected}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text selectable style={styles.settingHelp}>
          Disconnect before editing this URL. Current status: {hermes.status}
        </Text>
      </View>
    </ScrollView>
  );

  const renderActivePane = () => {
    switch (activePane) {
      case "sessions":
        return renderSessionsPane();
      case "activity":
        return renderActivityPane();
      case "settings":
        return renderSettingsPane();
      case "chat":
      default:
        return renderChatPane();
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <BlockingOverlays
        overlay={hermes.overlay}
        onApprovalChoice={hermes.answerApproval}
        onClarifyAnswer={hermes.answerClarify}
        onSudoSubmit={hermes.answerSudo}
        onSecretSubmit={hermes.answerSecret}
      />


      <Animated.View style={[styles.mainMenu, { transform: [{ translateX: drawerTranslate }] }]}>
        <View style={styles.menuHeader}>
          <View>
            <Text selectable style={styles.menuEyebrow}>Main menu</Text>
            <Text selectable style={styles.menuTitle}>Hermes</Text>
          </View>
          <Pressable style={styles.menuCloseButton} onPress={() => setDrawerOpen(false)} accessibilityRole="button" accessibilityLabel="Close main menu">
            <X color="#f0e6d2" size={20} />
          </Pressable>
        </View>

        <View style={styles.menuSection}>
          <Pressable style={menuItemStyle("chat")} onPress={() => selectPane("chat")}>
            <MessageSquare color={activePane === "chat" ? "#c7fff3" : "#9ee7d7"} size={18} />
            <View style={styles.menuItemTextGroup}>
              <Text style={styles.menuItemTitle}>Chat</Text>
              <Text style={styles.menuItemSubtitle}>{hermes.messages.length} messages</Text>
            </View>
          </Pressable>
          <Pressable
            style={[styles.menuItem, newChatDisabled && styles.menuItemDisabled]}
            onPress={startNewChat}
            disabled={newChatDisabled}
          >
            <Plus color="#9ee7d7" size={18} />
            <View style={styles.menuItemTextGroup}>
              <Text style={styles.menuItemTitle}>New chat</Text>
              <Text style={styles.menuItemSubtitle}>Start a fresh session</Text>
            </View>
          </Pressable>
          <Pressable
            style={[...menuItemStyle("sessions"), !hermes.connected && styles.menuItemDisabled]}
            onPress={() => selectPane("sessions")}
            disabled={!hermes.connected}
          >
            <History color={activePane === "sessions" ? "#c7fff3" : "#9ee7d7"} size={18} />
            <View style={styles.menuItemTextGroup}>
              <Text style={styles.menuItemTitle}>Sessions</Text>
              <Text style={styles.menuItemSubtitle}>{hermes.sessions.length} loaded</Text>
            </View>
          </Pressable>
          <Pressable style={menuItemStyle("activity")} onPress={() => selectPane("activity")}>
            <Activity color={activePane === "activity" ? "#c7fff3" : "#9ee7d7"} size={18} />
            <View style={styles.menuItemTextGroup}>
              <Text style={styles.menuItemTitle}>Activity</Text>
              <Text style={styles.menuItemSubtitle}>{hermes.tools.length} tool calls</Text>
            </View>
          </Pressable>
          <Pressable style={menuItemStyle("settings")} onPress={() => selectPane("settings")}>
            <Settings color={activePane === "settings" ? "#c7fff3" : "#9ee7d7"} size={18} />
            <View style={styles.menuItemTextGroup}>
              <Text style={styles.menuItemTitle}>Settings</Text>
              <Text style={styles.menuItemSubtitle}>Bridge and session behavior</Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.menuFooter}>
          <Text selectable style={styles.menuFooterLabel}>Connection</Text>
          <Text selectable style={styles.menuFooterValue}>{hermes.status}</Text>
        </View>
      </Animated.View>

      <Animated.View style={[styles.contentShell, { marginLeft: contentMarginLeft }]}> 
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable style={styles.menuButton} onPress={() => setDrawerOpen((open) => !open)} accessibilityRole="button" accessibilityLabel="Toggle main menu">
              <Menu color="#f0e6d2" size={22} />
            </Pressable>
            <View>
              <Text selectable style={styles.title}>Hermes Native GUI</Text>
              <Text selectable style={styles.subtitle}>{hermes.status}</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={[styles.secondaryButton, newChatDisabled && styles.sendDisabled]}
              onPress={startNewChat}
              disabled={newChatDisabled}
            >
              <Text style={styles.secondaryText}>New chat</Text>
            </Pressable>
            <Pressable
              style={[styles.connectionButton, hermes.connected ? styles.disconnect : styles.connect]}
              onPress={hermes.connected ? hermes.disconnect : hermes.connect}
              disabled={hermes.connecting}
            >
              {hermes.connecting ? (
                <ActivityIndicator color="#081111" />
              ) : hermes.connected ? (
                <WifiOff color="#f7d6d6" size={18} />
              ) : (
                <Wifi color="#081111" size={18} />
              )}
              <Text style={[styles.connectionText, hermes.connected && styles.disconnectText]}>
                {hermes.connected ? "Disconnect" : "Connect"}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.paneChrome}>
          <Text selectable style={styles.paneTitle}>{paneTitle}</Text>
          <Text selectable style={styles.paneSubtitle}>{paneSubtitle}</Text>
        </View>

        {renderActivePane()}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#071111", overflow: "hidden" },
  contentShell: { flex: 1, minWidth: 0, backgroundColor: "#071111" },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderColor: "#173030",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  title: { color: "#f0e6d2", fontSize: 24, fontWeight: "800" },
  subtitle: { color: "#9fb8b8", marginTop: 4 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0, flex: 1 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  menuButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: "#284848", backgroundColor: "#0d1d1d", alignItems: "center", justifyContent: "center" },
  mainMenu: { position: "absolute", left: 0, top: 0, bottom: 0, zIndex: 20, width: MAIN_MENU_WIDTH, backgroundColor: "#091818", borderRightWidth: 1, borderColor: "#284848", padding: 18, shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 8, height: 0 }, elevation: 12 },
  menuHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 22 },
  menuEyebrow: { color: "#7f9292", fontSize: 11, fontWeight: "800", letterSpacing: 1.4, textTransform: "uppercase" },
  menuTitle: { color: "#f0e6d2", fontSize: 28, fontWeight: "900", marginTop: 3 },
  menuCloseButton: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: "#284848", alignItems: "center", justifyContent: "center" },
  menuSection: { gap: 10 },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: "#1d3737", backgroundColor: "#0d1d1d", borderRadius: 16, padding: 14 },
  menuItemActive: { borderColor: "#3f867a", backgroundColor: "#12302d" },
  menuItemDisabled: { opacity: 0.45 },
  menuItemTextGroup: { flex: 1, minWidth: 0 },
  menuItemTitle: { color: "#f0e6d2", fontWeight: "900", fontSize: 15 },
  menuItemSubtitle: { color: "#9fb8b8", marginTop: 2, fontSize: 12 },
  menuFooter: { marginTop: "auto", borderTopWidth: 1, borderColor: "#173030", paddingTop: 14 },
  menuFooterLabel: { color: "#7f9292", fontSize: 11, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" },
  menuFooterValue: { color: "#bdd2d2", marginTop: 6, lineHeight: 18 },
  connectionButton: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  secondaryButton: { borderWidth: 1, borderColor: "#284848", backgroundColor: "#0d1d1d", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  secondaryText: { color: "#c7fff3", fontWeight: "800" },
  connect: { backgroundColor: "#9ee7d7" },
  disconnect: { backgroundColor: "#4b2020", borderWidth: 1, borderColor: "#865050" },
  connectionText: { color: "#081111", fontWeight: "800" },
  disconnectText: { color: "#f7d6d6" },
  paneChrome: { paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 1, borderColor: "#173030", backgroundColor: "#081515" },
  paneTitle: { color: "#f0e6d2", fontSize: 20, fontWeight: "900" },
  paneSubtitle: { color: "#9fb8b8", marginTop: 3 },
  chatPane: { flex: 1, minHeight: 0, flexDirection: "row" },
  chatMain: { flex: 1, minWidth: 0 },
  activitySidebar: { width: 320, borderLeftWidth: 1, borderColor: "#173030", backgroundColor: "#081515", padding: 14 },
  activityFeedFull: { gap: 14 },
  activityFeedCompact: { gap: 10 },
  transcript: { flex: 1 },
  transcriptContent: { padding: 24, gap: 14 },
  bubble: { maxWidth: 900, alignSelf: "flex-start", backgroundColor: "#102222", borderWidth: 1, borderColor: "#244444", borderRadius: 16, padding: 16 },
  userBubble: { alignSelf: "flex-end", backgroundColor: "#173c38", borderColor: "#3f867a" },
  systemBubble: { backgroundColor: "#221a10", borderColor: "#6e5127" },
  role: { color: "#9ee7d7", fontSize: 12, fontWeight: "800", textTransform: "uppercase", marginBottom: 8 },
  userRole: { color: "#c7fff3" },
  systemRole: { color: "#ffd99e" },
  messageText: { color: "#f0e6d2", fontSize: 15, lineHeight: 22, userSelect: "text" as any },
  userText: { color: "#f7fffc" },
  systemText: { color: "#ffe6be" },
  emptyState: { marginTop: 24, maxWidth: 720, alignSelf: "center", gap: 14, padding: 24, borderWidth: 1, borderColor: "#244444", borderRadius: 20, backgroundColor: "#0d1d1d" },
  compactEmptyState: { marginTop: 12, gap: 8, padding: 14, borderWidth: 1, borderColor: "#244444", borderRadius: 14, backgroundColor: "#0d1d1d" },
  emptyTitle: { color: "#f0e6d2", fontSize: 24, fontWeight: "800" },
  compactEmptyTitle: { color: "#f0e6d2", fontSize: 15, fontWeight: "800" },
  emptyText: { color: "#bdd2d2", fontSize: 16, lineHeight: 24 },
  compactEmptyText: { color: "#bdd2d2", fontSize: 12, lineHeight: 18 },
  emptyCode: { color: "#9ee7d7", fontFamily: Platform.select({ web: "Menlo, monospace", default: undefined }), backgroundColor: "#071111", padding: 12, borderRadius: 10 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 12, padding: 16, borderTopWidth: 1, borderColor: "#173030", backgroundColor: "#081515" },
  input: { flex: 1, minHeight: 48, maxHeight: 160, color: "#f0e6d2", backgroundColor: "#0d1d1d", borderWidth: 1, borderColor: "#284848", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  sendButton: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#9ee7d7", paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14 },
  stopButton: { backgroundColor: "#4b2020", borderWidth: 1, borderColor: "#865050" },
  sendDisabled: { opacity: 0.45 },
  sendText: { color: "#081111", fontWeight: "900" },
  stopText: { color: "#f7d6d6" },
  fullPane: { flex: 1 },
  fullPaneContent: { padding: 24, gap: 14 },
  panelHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 4 },
  sectionTitle: { color: "#f0e6d2", fontSize: 18, fontWeight: "900" },
  sectionSubtitle: { color: "#9fb8b8", marginTop: 4 },
  sessionCard: { borderWidth: 1, borderColor: "#244444", borderRadius: 14, padding: 14, backgroundColor: "#0b1919" },
  sessionTitle: { color: "#f0e6d2", fontWeight: "800", fontSize: 15 },
  sessionMeta: { color: "#7f9292", marginTop: 4, fontSize: 12 },
  sessionPreview: { color: "#bdd2d2", marginTop: 9, fontSize: 13, lineHeight: 18 },
  toolCard: { borderWidth: 1, borderColor: "#244444", borderRadius: 14, padding: 14, backgroundColor: "#0d1d1d" },
  toolName: { color: "#9ee7d7", fontWeight: "800" },
  toolStatus: { color: "#9fb8b8", marginTop: 2 },
  toolPreview: { color: "#d9e5e2", marginTop: 8, fontSize: 12, lineHeight: 18 },
  settingsCard: { maxWidth: 760, borderWidth: 1, borderColor: "#244444", borderRadius: 18, padding: 18, backgroundColor: "#0d1d1d", gap: 12 },
  urlInput: { color: "#f0e6d2", backgroundColor: "#071111", borderWidth: 1, borderColor: "#284848", borderRadius: 10, padding: 12 },
  settingHelp: { color: "#9fb8b8", lineHeight: 20 },
  settingRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 4 },
  settingRowText: { flex: 1, minWidth: 0, gap: 6 },
  settingRowTitle: { color: "#f0e6d2", fontWeight: "800", fontSize: 15 },
  toggle: { width: 46, height: 28, borderRadius: 999, borderWidth: 1, borderColor: "#284848", backgroundColor: "#071111", padding: 3, justifyContent: "center" },
  toggleOn: { backgroundColor: "#173c38", borderColor: "#3f867a" },
  toggleKnob: { width: 20, height: 20, borderRadius: 999, backgroundColor: "#7f9292" },
  toggleKnobOn: { alignSelf: "flex-end", backgroundColor: "#c7fff3" },
});
