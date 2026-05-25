import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";
import type { NativeThemeColors } from "../themes/types";

type Props = {
  icon: string;
  label: string;
  sub?: string;
  submitLabel?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
};

export function SecureInputModal({
  icon,
  label,
  sub,
  submitLabel = "Submit",
  onSubmit,
  onCancel,
}: Props) {
  const { colors } = useDashboardTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [value, setValue] = useState("");

  return (
    <View style={styles.card}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.label}>{label}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={setValue}
        placeholder="Enter value…"
        placeholderTextColor={colors.midgroundMuted}
        secureTextEntry
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={() => {
          onSubmit(value);
          setValue("");
        }}
      />
      <View style={styles.row}>
        <Pressable
          style={[styles.button, styles.primaryButton]}
          onPress={() => {
            onSubmit(value);
            setValue("");
          }}
        >
          <Text style={styles.primaryText}>{submitLabel}</Text>
        </Pressable>
        <Pressable
          style={styles.button}
          onPress={() => {
            setValue("");
            onCancel();
          }}
        >
          <Text style={styles.buttonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: NativeThemeColors) {
  return StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 16,
    padding: 20,
    gap: 12,
    maxWidth: 480,
    width: "100%",
  },
  icon: { fontSize: 28 },
  label: { color: colors.midground, fontSize: 17, fontWeight: "700", lineHeight: 24 },
  sub: { color: colors.midgroundFaint, fontSize: 14 },
  input: {
    color: colors.midground,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  row: { flexDirection: "row", gap: 8 },
  button: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
  },
  primaryButton: {
    backgroundColor: colors.accentStrong,
    borderColor: colors.borderStrong,
  },
  buttonText: { color: colors.midgroundFaint, fontWeight: "700" },
  primaryText: { color: colors.midground, fontWeight: "800" },
  });
}
