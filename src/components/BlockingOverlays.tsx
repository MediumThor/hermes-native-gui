import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import type { ApprovalChoice, OverlayState } from "../types";
import { ApprovalModal } from "./ApprovalModal";
import { ClarifyPicker } from "./ClarifyPicker";
import { SecureInputModal } from "./SecureInputModal";

type Props = {
  overlay: OverlayState;
  onApprovalChoice: (choice: ApprovalChoice) => void;
  onClarifyAnswer: (answer: string) => void;
  onSudoSubmit: (password: string) => void;
  onSecretSubmit: (value: string) => void;
};

export function BlockingOverlays({
  overlay,
  onApprovalChoice,
  onClarifyAnswer,
  onSudoSubmit,
  onSecretSubmit,
}: Props) {
  const visible = Boolean(
    overlay.approval || overlay.clarify || overlay.sudo || overlay.secret,
  );

  let content: ReactNode = null;

  if (overlay.approval) {
    content = <ApprovalModal req={overlay.approval} onChoice={onApprovalChoice} />;
  } else if (overlay.clarify) {
    content = (
      <ClarifyPicker
        req={overlay.clarify}
        onAnswer={onClarifyAnswer}
        onCancel={() => onClarifyAnswer("")}
      />
    );
  } else if (overlay.sudo) {
    content = (
      <SecureInputModal
        icon="🔐"
        label="sudo password required"
        onSubmit={onSudoSubmit}
        onCancel={() => onSudoSubmit("")}
      />
    );
  } else if (overlay.secret) {
    content = (
      <SecureInputModal
        icon="🔑"
        label={overlay.secret.prompt}
        sub={`for ${overlay.secret.envVar}`}
        onSubmit={onSecretSubmit}
        onCancel={() => onSecretSubmit("")}
      />
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <Pressable style={styles.backdrop}>
        <Pressable style={styles.center} onPress={(event) => event.stopPropagation()}>
          {content}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  center: {
    width: "100%",
    alignItems: "center",
  },
});
