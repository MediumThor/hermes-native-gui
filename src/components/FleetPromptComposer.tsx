import { ChevronDown, Send } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  FLEET_NEW_AGENT_TARGET,
  fleetPromptTargetOptions,
  type FleetSnapshot,
} from "../fleetMission";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";
import type { NativeThemeColors } from "../themes/types";

type Props = {
  snapshot: FleetSnapshot;
  connected: boolean;
  disabled?: boolean;
  onSend: (targetId: string, text: string) => Promise<void>;
};

function createStyles(colors: NativeThemeColors) {
  return StyleSheet.create({
    shell: {
      borderTopWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 16,
      gap: 10,
    },
    targetRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
    targetLabel: { color: colors.midgroundFaint, fontSize: 12, fontWeight: "800" },
    targetButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      maxWidth: "100%",
    },
    targetText: { color: colors.midground, fontSize: 13, fontWeight: "800", flexShrink: 1 },
    targetMenu: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      overflow: "hidden",
    },
    targetOption: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    targetOptionActive: { backgroundColor: colors.accent },
    targetOptionText: { color: colors.midground, fontSize: 13, fontWeight: "700" },
    composerRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 160,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      backgroundColor: colors.background,
      color: colors.midground,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      lineHeight: 22,
    },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.success,
      alignItems: "center",
      justifyContent: "center",
    },
    sendButtonDisabled: { opacity: 0.45 },
    hint: { color: colors.midgroundMuted, fontSize: 11, lineHeight: 16 },
  });
}

export function FleetPromptComposer({ snapshot, connected, disabled = false, onSend }: Props) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const options = useMemo(() => fleetPromptTargetOptions(snapshot), [snapshot]);
  const [targetId, setTargetId] = useState(options[0]?.id ?? FLEET_NEW_AGENT_TARGET);
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (options.some((option) => option.id === targetId)) return;
    setTargetId(options[0]?.id ?? FLEET_NEW_AGENT_TARGET);
  }, [options, targetId]);

  const selected = options.find((option) => option.id === targetId) ?? options[0];
  const canSend = connected && !disabled && !sending && draft.trim().length > 0;

  const submit = async () => {
    if (!canSend || !selected) return;
    setSending(true);
    try {
      await onSend(selected.id, draft.trim());
      setDraft("");
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.shell}>
      <View style={styles.targetRow}>
        <Text style={styles.targetLabel}>Target</Text>
        <Pressable
          style={styles.targetButton}
          onPress={() => setMenuOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityLabel="Select prompt target session"
        >
          <Text style={styles.targetText} numberOfLines={1}>{selected?.label ?? "New agent…"}</Text>
          <ChevronDown color={colors.midgroundFaint} size={14} />
        </Pressable>
      </View>

      {menuOpen ? (
        <View style={styles.targetMenu}>
          {options.map((option) => (
            <Pressable
              key={option.id}
              style={[styles.targetOption, option.id === targetId && styles.targetOptionActive]}
              onPress={() => {
                setTargetId(option.id);
                setMenuOpen(false);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Target ${option.label}`}
            >
              <Text style={styles.targetOptionText}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.composerRow}>
        <TextInput
          style={styles.input}
          multiline
          value={draft}
          onChangeText={setDraft}
          placeholder={
            connected
              ? selected?.kind === "new"
                ? "Describe the goal for a new agent…"
                : `Send a prompt to ${selected?.label ?? "this agent"}…`
              : "Connect to the bridge first…"
          }
          placeholderTextColor={colors.midgroundMuted}
          editable={connected && !disabled && !sending}
          onKeyPress={(event) => {
            if (Platform.OS !== "web") return;
            const native = event.nativeEvent as { key?: string; shiftKey?: boolean };
            if (native.key !== "Enter" || native.shiftKey) return;
            event.preventDefault?.();
            void submit();
          }}
        />
        <Pressable
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
          onPress={() => void submit()}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send fleet prompt"
        >
          <Send color={colors.background} size={18} />
        </Pressable>
      </View>

      <Text style={styles.hint}>
        Fleet prompts go directly to the selected session. New agent spawns a separate Hermes session without switching chat.
      </Text>
    </View>
  );
}
