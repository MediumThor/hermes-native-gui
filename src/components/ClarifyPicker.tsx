import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ClarifyReq } from "../types";

type Props = {
  req: ClarifyReq;
  onAnswer: (answer: string) => void;
  onCancel: () => void;
};

export function ClarifyPicker({ req, onAnswer, onCancel }: Props) {
  const choices = req.choices ?? [];
  const [custom, setCustom] = useState("");
  const [typing, setTyping] = useState(choices.length === 0);

  if (typing) {
    return (
      <View style={styles.card}>
        <Text style={styles.label}>ask</Text>
        <Text style={styles.question}>{req.question}</Text>
        <TextInput
          style={styles.input}
          value={custom}
          onChangeText={setCustom}
          placeholder="Type your answer…"
          placeholderTextColor="#7f9292"
          autoFocus
          onSubmitEditing={() => onAnswer(custom.trim())}
        />
        <View style={styles.row}>
          <Pressable
            style={[styles.button, styles.primaryButton, !custom.trim() && styles.disabled]}
            disabled={!custom.trim()}
            onPress={() => onAnswer(custom.trim())}
          >
            <Text style={styles.primaryText}>Submit</Text>
          </Pressable>
          {choices.length > 0 ? (
            <Pressable style={styles.button} onPress={() => setTyping(false)}>
              <Text style={styles.buttonText}>Back</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.button} onPress={onCancel}>
              <Text style={styles.buttonText}>Cancel</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.label}>ask</Text>
      <Text style={styles.question}>{req.question}</Text>
      <View style={styles.choices}>
        {choices.map((choice) => (
          <Pressable key={choice} style={styles.choiceButton} onPress={() => onAnswer(choice)}>
            <Text style={styles.choiceText}>{choice}</Text>
          </Pressable>
        ))}
        <Pressable style={styles.choiceButton} onPress={() => setTyping(true)}>
          <Text style={styles.choiceText}>Other (type your answer)</Text>
        </Pressable>
      </View>
      <Pressable style={styles.cancelLink} onPress={onCancel}>
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
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
    maxWidth: 640,
    width: "100%",
  },
  label: {
    color: "#9ee7d7",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  question: { color: "#f0e6d2", fontSize: 17, lineHeight: 24, fontWeight: "600" },
  choices: { gap: 8 },
  choiceButton: {
    backgroundColor: "#0d1d1d",
    borderWidth: 1,
    borderColor: "#284848",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  choiceText: { color: "#f0e6d2", fontSize: 15 },
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
  disabled: { opacity: 0.45 },
  buttonText: { color: "#9fb8b8", fontWeight: "700" },
  primaryText: { color: "#c7fff3", fontWeight: "800" },
  cancelLink: { alignSelf: "flex-start" },
  cancelText: { color: "#9fb8b8", fontSize: 14 },
});
