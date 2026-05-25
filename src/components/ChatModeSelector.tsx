import { Pressable, Text, View } from "react-native";
import { CHAT_MODES, chatModeDefinition, type ChatMode } from "../chatModes";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";

type Props = {
  mode: ChatMode;
  disabled?: boolean;
  onChange: (mode: ChatMode) => void;
};

export function ChatModeSelector({ mode, disabled = false, onChange }: Props) {
  const { styles } = useDashboardTheme();
  const active = chatModeDefinition(mode);

  return (
    <View style={styles.chatModeWrap}>
      <View style={styles.chatModeToggle}>
        {CHAT_MODES.map((entry) => {
          const selected = entry.id === mode;
          return (
            <Pressable
              key={entry.id}
              style={[styles.chatModeButton, selected && styles.chatModeButtonActive]}
              onPress={() => onChange(entry.id)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={`${entry.label} mode`}
            >
              <Text style={[styles.chatModeButtonText, selected && styles.chatModeButtonTextActive]}>
                {entry.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text selectable style={styles.chatModeDescription}>{active.description}</Text>
    </View>
  );
}
