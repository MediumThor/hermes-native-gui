import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

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
        placeholderTextColor="#7f9292"
        secureTextEntry
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={() => onSubmit(value)}
      />
      <View style={styles.row}>
        <Pressable style={[styles.button, styles.primaryButton]} onPress={() => onSubmit(value)}>
          <Text style={styles.primaryText}>{submitLabel}</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={onCancel}>
          <Text style={styles.buttonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#102222",
    borderWidth: 1,
    borderColor: "#3f867a",
    borderRadius: 16,
    padding: 20,
    gap: 12,
    maxWidth: 480,
    width: "100%",
  },
  icon: { fontSize: 28 },
  label: { color: "#f0e6d2", fontSize: 17, fontWeight: "700", lineHeight: 24 },
  sub: { color: "#9fb8b8", fontSize: 14 },
  input: {
    color: "#f0e6d2",
    backgroundColor: "#071111",
    borderWidth: 1,
    borderColor: "#284848",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  row: { flexDirection: "row", gap: 8 },
  button: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#284848",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#0d1d1d",
  },
  primaryButton: {
    backgroundColor: "#173c38",
    borderColor: "#3f867a",
  },
  buttonText: { color: "#9fb8b8", fontWeight: "700" },
  primaryText: { color: "#c7fff3", fontWeight: "800" },
});
