import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ApprovalChoice, ApprovalReq } from "../types";

const CHOICES: { value: ApprovalChoice; label: string }[] = [
  { value: "once", label: "Allow once" },
  { value: "session", label: "Allow this session" },
  { value: "always", label: "Always allow" },
  { value: "deny", label: "Deny" },
];

const CMD_PREVIEW_LINES = 10;

type Props = {
  req: ApprovalReq;
  onChoice: (choice: ApprovalChoice) => void;
};

export function ApprovalModal({ req, onChoice }: Props) {
  const lines = req.command.split("\n");
  const shown = lines.slice(0, CMD_PREVIEW_LINES);
  const overflow = lines.length - shown.length;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Approval required</Text>
      <Text style={styles.description}>{req.description}</Text>

      <ScrollView style={styles.commandBox} nestedScrollEnabled>
        {shown.map((line, index) => (
          <Text key={index} selectable style={styles.commandLine}>
            {line || " "}
          </Text>
        ))}
        {overflow > 0 ? (
          <Text style={styles.overflow}>… +{overflow} more line{overflow === 1 ? "" : "s"}</Text>
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        {CHOICES.map((choice) => (
          <Pressable
            key={choice.value}
            style={[styles.button, choice.value === "deny" && styles.denyButton]}
            onPress={() => onChoice(choice.value)}
          >
            <Text style={[styles.buttonText, choice.value === "deny" && styles.denyText]}>
              {choice.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#221a10",
    borderWidth: 2,
    borderColor: "#c49a3a",
    borderRadius: 16,
    padding: 20,
    gap: 12,
    maxWidth: 640,
    width: "100%",
  },
  title: { color: "#ffd99e", fontSize: 18, fontWeight: "800" },
  description: { color: "#ffe6be", fontSize: 15, lineHeight: 22 },
  commandBox: {
    maxHeight: 180,
    backgroundColor: "#071111",
    borderWidth: 1,
    borderColor: "#6e5127",
    borderRadius: 10,
    padding: 12,
  },
  commandLine: {
    color: "#f0e6d2",
    fontFamily: "Menlo, monospace",
    fontSize: 13,
    lineHeight: 20,
  },
  overflow: { color: "#9fb8b8", fontSize: 12, marginTop: 6 },
  actions: { gap: 8 },
  button: {
    backgroundColor: "#173c38",
    borderWidth: 1,
    borderColor: "#3f867a",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  denyButton: {
    backgroundColor: "#4b2020",
    borderColor: "#865050",
  },
  buttonText: { color: "#c7fff3", fontWeight: "700", textAlign: "center" },
  denyText: { color: "#f7d6d6" },
});
