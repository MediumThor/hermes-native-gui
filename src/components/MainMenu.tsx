import type { LucideIcon } from "lucide-react-native";
import {
  Activity,
  BookOpen,
  CalendarClock,
  Cpu,
  History,
  KeyRound,
  MessageSquare,
  Package,
  Plug,
  Plus,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  TerminalSquare,
  X,
} from "lucide-react-native";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  INTERRUPT_TOGGLE_TITLE,
} from "../interruptToggleCopy";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";
import type { NativeThemeColors } from "../themes/types";
import { ThemeSwitcher } from "./ThemeSwitcher";

export const MAIN_MENU_WIDTH = 304;

export type MainMenuPane = "chat" | "sessions" | "activity" | "settings" | "commands" | "models" | "tools" | "skills" | "plugins" | "cron" | "keys" | "system" | "logs";

type Props = {
  activePane: MainMenuPane;
  status: string;
  messageCount: number;
  sessionCount: number;
  toolCount: number;
  runningSessionLabel?: string | null;
  runningSessionActivity?: string;
  newChatDisabled: boolean;
  newChatSubtitle: string;
  sessionsDisabled: boolean;
  interruptOnNewChat: boolean;
  onSelectPane: (pane: MainMenuPane) => void;
  onNewChat: () => void;
  onToggleInterrupt: () => void;
  onClose: () => void;
};

function createStyles(colors: NativeThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRightWidth: 1,
      borderColor: colors.border,
      padding: 16,
    },
    menuHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 16,
    },
    menuEyebrow: {
      color: colors.midgroundMuted,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.4,
      textTransform: "uppercase",
    },
    menuTitle: {
      color: colors.midground,
      fontSize: 26,
      fontWeight: "900",
      marginTop: 3,
    },
    menuCloseButton: {
      width: 38,
      height: 38,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    runningCard: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.accent,
      borderRadius: 16,
      padding: 14,
      marginBottom: 14,
      gap: 4,
    },
    runningEyebrow: {
      color: colors.success,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.1,
      textTransform: "uppercase",
    },
    runningTitle: {
      color: colors.midground,
      fontWeight: "900",
      fontSize: 13,
    },
    runningSubtitle: {
      color: colors.midgroundFaint,
      fontSize: 12,
      lineHeight: 17,
    },
    menuScroll: { flex: 1 },
    menuSection: { gap: 14, paddingBottom: 8 },
    menuGroup: { gap: 8 },
    menuGroupTitle: {
      color: colors.midgroundMuted,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1.1,
      textTransform: "uppercase",
      paddingHorizontal: 4,
      marginTop: 2,
    },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    menuItemActive: {
      borderColor: colors.borderStrong,
      backgroundColor: colors.accent,
    },
    menuItemDisabled: { opacity: 0.45 },
    menuItemTextGroup: { flex: 1, minWidth: 0 },
    menuItemTitle: {
      color: colors.midground,
      fontWeight: "900",
      fontSize: 15,
    },
    menuItemSubtitle: {
      color: colors.midgroundFaint,
      marginTop: 1,
      fontSize: 11,
    },
    menuOptions: {
      borderTopWidth: 1,
      borderColor: colors.border,
      paddingTop: 14,
      marginTop: 14,
      gap: 10,
    },
    menuOptionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 16,
      padding: 14,
    },
    menuOptionTitle: {
      color: colors.midground,
      fontWeight: "800",
      fontSize: 14,
    },
    toggle: {
      width: 46,
      height: 28,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      padding: 3,
      justifyContent: "center",
    },
    toggleOn: {
      backgroundColor: colors.accentStrong,
      borderColor: colors.borderStrong,
    },
    toggleKnob: {
      width: 20,
      height: 20,
      borderRadius: 999,
      backgroundColor: colors.midgroundMuted,
    },
    toggleKnobOn: {
      alignSelf: "flex-end",
      backgroundColor: colors.highlight,
    },
    menuFooter: {
      borderTopWidth: 1,
      borderColor: colors.border,
      paddingTop: 14,
      marginTop: 8,
    },
    menuFooterLabel: {
      color: colors.midgroundMuted,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    menuFooterValue: {
      color: colors.midgroundFaint,
      marginTop: 6,
      lineHeight: 18,
    },
  });
}

export function MainMenu({
  activePane,
  status,
  messageCount,
  sessionCount,
  toolCount,
  runningSessionLabel,
  runningSessionActivity,
  newChatDisabled,
  newChatSubtitle,
  sessionsDisabled,
  interruptOnNewChat,
  onSelectPane,
  onNewChat,
  onToggleInterrupt,
  onClose,
}: Props) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const menuItemStyle = (pane: MainMenuPane, disabled = false) => [
    styles.menuItem,
    activePane === pane && styles.menuItemActive,
    disabled && styles.menuItemDisabled,
  ];

  const renderPaneItem = (
    pane: MainMenuPane,
    label: string,
    subtitle: string,
    Icon: LucideIcon,
    disabled = false,
  ) => (
    <Pressable
      key={pane}
      style={menuItemStyle(pane, disabled)}
      onPress={() => onSelectPane(pane)}
      disabled={disabled}
    >
      <Icon color={activePane === pane ? colors.midground : colors.midgroundMuted} size={18} />
      <View style={styles.menuItemTextGroup}>
        <Text style={styles.menuItemTitle}>{label}</Text>
        <Text style={styles.menuItemSubtitle}>{subtitle}</Text>
      </View>
    </Pressable>
  );

  const renderActionItem = () => (
    <Pressable
      key="new-chat"
      style={[styles.menuItem, newChatDisabled && styles.menuItemDisabled]}
      onPress={onNewChat}
      disabled={newChatDisabled}
    >
      <Plus color={colors.midgroundMuted} size={18} />
      <View style={styles.menuItemTextGroup}>
        <Text style={styles.menuItemTitle}>New chat</Text>
        <Text style={styles.menuItemSubtitle}>{newChatSubtitle}</Text>
      </View>
    </Pressable>
  );

  const navGroups: Array<{ title: string; items: Array<ReactNode> }> = [
    {
      title: "Chat",
      items: [
        renderPaneItem("chat", "Chat", `${messageCount} messages`, MessageSquare),
        renderActionItem(),
        renderPaneItem("sessions", "Sessions", `${sessionCount} recent chats`, History, sessionsDisabled),
        renderPaneItem("activity", "Activity", `${toolCount} tool calls`, Activity),
      ],
    },
    {
      title: "Configure",
      items: [
        renderPaneItem("settings", "Settings", "Bridge, models, and behavior", Settings),
        renderPaneItem("commands", "Commands", "Slash command reference", BookOpen),
        renderPaneItem("models", "Models", "Providers and model picker", Cpu),
        renderPaneItem("tools", "Tools", "Toolset enablement", SlidersHorizontal),
        renderPaneItem("keys", "Keys", "Credential status", KeyRound),
      ],
    },
    {
      title: "System",
      items: [
        renderPaneItem("skills", "Skills", "Install, browse, and toggle skills", Package),
        renderPaneItem("plugins", "Plugins", "Plugins and MCP reload", Plug),
        renderPaneItem("cron", "Cron", "Scheduled jobs", CalendarClock),
        renderPaneItem("system", "System", "Profile and config", ShieldCheck),
        renderPaneItem("logs", "Runtime", "Process and browser state", TerminalSquare),
      ],
    },
  ];

  return (
    <View style={styles.root}>
      <View style={styles.menuHeader}>
        <View>
          <Text selectable style={styles.menuEyebrow}>Main menu</Text>
          <Text selectable style={styles.menuTitle}>Hermes</Text>
        </View>
        <Pressable
          style={styles.menuCloseButton}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close main menu"
        >
          <X color={colors.midground} size={20} />
        </Pressable>
      </View>

      {runningSessionLabel ? (
        <View style={styles.runningCard}>
          <Text style={styles.runningEyebrow}>Active agent</Text>
          <Text selectable style={styles.runningTitle}>{runningSessionLabel}</Text>
          <Text selectable style={styles.runningSubtitle} numberOfLines={2}>
            {runningSessionActivity?.trim() || "Hermes is working in this session."}
          </Text>
        </View>
      ) : null}

      <ScrollView style={styles.menuScroll} contentContainerStyle={styles.menuSection}>
        {navGroups.map((group) => (
          <View key={group.title} style={styles.menuGroup}>
            <Text selectable style={styles.menuGroupTitle}>{group.title}</Text>
            {group.items}
          </View>
        ))}
      </ScrollView>

      <View style={styles.menuOptions}>
        <ThemeSwitcher />
        <Pressable
          style={styles.menuOptionRow}
          onPress={onToggleInterrupt}
          accessibilityRole="switch"
          accessibilityState={{ checked: interruptOnNewChat }}
        >
          <View style={styles.menuItemTextGroup}>
            <Text style={styles.menuOptionTitle}>{INTERRUPT_TOGGLE_TITLE}</Text>
          </View>
          <View style={[styles.toggle, interruptOnNewChat && styles.toggleOn]}>
            <View style={[styles.toggleKnob, interruptOnNewChat && styles.toggleKnobOn]} />
          </View>
        </Pressable>
      </View>

      <View style={styles.menuFooter}>
        <Text selectable style={styles.menuFooterLabel}>Connection</Text>
        <Text selectable style={styles.menuFooterValue}>{status}</Text>
      </View>
    </View>
  );
}
