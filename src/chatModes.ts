export type ChatMode = "agent" | "plan" | "ask";

export type ChatModeDefinition = {
  id: ChatMode;
  label: string;
  description: string;
  placeholder: string;
};

export const CHAT_MODES: ChatModeDefinition[] = [
  {
    id: "agent",
    label: "Agent",
    description: "Full tools — implement, run commands, and iterate.",
    placeholder: "Ask Hermes to build, debug, or run tools…",
  },
  {
    id: "plan",
    label: "Plan",
    description: "Planning only — writes a markdown plan to .hermes/plans/.",
    placeholder: "Describe what to plan — Hermes will not execute changes…",
  },
  {
    id: "ask",
    label: "Ask",
    description: "Read-only — answer questions without edits or shell commands.",
    placeholder: "Ask a question — read-only, no file edits or commands…",
  },
];

const ASK_MODE_INSTRUCTION =
  "You are in Ask mode. Answer using read-only context and lookup tools when helpful. "
  + "Do not edit files, run mutating shell commands, commit, push, or take external actions. "
  + "If the user wants implementation work, tell them to switch to Agent mode.";

export type FormattedSubmission =
  | { kind: "prompt"; payload: string }
  | { kind: "slash"; payload: string };

export function isChatMode(value: unknown): value is ChatMode {
  return value === "agent" || value === "plan" || value === "ask";
}

export function chatModeDefinition(mode: ChatMode): ChatModeDefinition {
  return CHAT_MODES.find((entry) => entry.id === mode) ?? CHAT_MODES[0];
}

/** Route composer text through the active chat mode before send/queue. */
export function formatSubmissionForChatMode(text: string, mode: ChatMode): FormattedSubmission {
  const trimmed = text.trim();
  if (!trimmed) return { kind: "prompt", payload: "" };
  if (trimmed.startsWith("/")) return { kind: "slash", payload: trimmed };

  switch (mode) {
    case "plan":
      return { kind: "slash", payload: `/plan ${trimmed}` };
    case "ask":
      return { kind: "prompt", payload: `${ASK_MODE_INSTRUCTION}\n\n${trimmed}` };
    default:
      return { kind: "prompt", payload: trimmed };
  }
}
