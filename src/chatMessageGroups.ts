import type { ChatMessage } from "./types";
import {
  actionFromSystemMessageText,
  actionsFromSystemMessages,
  consolidateTurnActivities,
  isRenderableActivity,
  type AgentAction,
} from "./agentActivity";

function messageActionStatus(status?: ChatMessage["status"]) {
  if (status === "error" || status === "interrupted") return "error" as const;
  if (status === "complete") return "complete" as const;
  if (status === "streaming") return "running" as const;
  return undefined;
}

export type AgentTurnSegment =
  | { type: "thought"; id: string; text: string; streaming?: boolean }
  | { type: "activity"; id: string; action: AgentAction }
  | { type: "response"; id: string; message: ChatMessage };

export type AgentTurn = {
  id: string;
  segments: AgentTurnSegment[];
};

export type TranscriptMessageGroup =
  | { type: "message"; id: string; message: ChatMessage }
  | { type: "agentTurn"; id: string; turn: AgentTurn };

function actionsForSystemMessage(message: ChatMessage): AgentAction[] {
  const status = messageActionStatus(message.status);
  const rows = actionsFromSystemMessages([{ text: message.text, status }]);
  if (rows.length > 0) return rows;
  const fallback = actionFromSystemMessageText(message.text, status);
  return isRenderableActivity(fallback) ? [fallback] : [];
}

/** Merge incremental reasoning fragments into one continuous thought string. */
export function mergeThoughtParts(parts: string[]): string {
  const merged: string[] = [];
  for (const part of parts.map((value) => value.trim()).filter(Boolean)) {
    const last = merged[merged.length - 1];
    if (last && part.startsWith(last)) {
      merged[merged.length - 1] = part;
      continue;
    }
    if (merged.some((existing) => existing === part || existing.startsWith(part))) continue;
    merged.push(part);
  }
  return merged.join("\n");
}

export function buildAgentTurn(messages: ChatMessage[]): AgentTurn {
  const segments: AgentTurnSegment[] = [];
  let pendingThoughtParts: string[] = [];
  let pendingThoughtStreaming = false;
  let pendingThoughtId = "";

  const flushThought = () => {
    const text = mergeThoughtParts(pendingThoughtParts);
    if (!text && !pendingThoughtStreaming) {
      pendingThoughtParts = [];
      pendingThoughtStreaming = false;
      pendingThoughtId = "";
      return;
    }
    segments.push({
      type: "thought",
      id: pendingThoughtId || `thought-${segments.length}`,
      text,
      streaming: pendingThoughtStreaming,
    });
    pendingThoughtParts = [];
    pendingThoughtStreaming = false;
    pendingThoughtId = "";
  };

  for (const message of messages) {
    if (message.role === "system") {
      flushThought();
      for (const action of consolidateTurnActivities(actionsForSystemMessage(message))) {
        segments.push({ type: "activity", id: `${message.id}-${segments.length}`, action });
      }
      continue;
    }
    if (message.role !== "assistant") continue;

    const reasoning = message.reasoning?.trim() ?? "";
    const text = message.text?.trim() ?? "";

    if (text) {
      flushThought();
      if (reasoning) {
        segments.push({
          type: "thought",
          id: `${message.id}-thought`,
          text: reasoning,
          streaming: message.status === "streaming",
        });
      }
      segments.push({
        type: "response",
        id: message.id,
        message: { ...message, reasoning: undefined },
      });
      continue;
    }

    if (reasoning) {
      if (!pendingThoughtId) pendingThoughtId = message.id;
      pendingThoughtParts.push(reasoning);
      if (message.status === "streaming") pendingThoughtStreaming = true;
    }
  }

  flushThought();

  return {
    id: `turn-${messages[0]?.id ?? "empty"}`,
    segments,
  };
}

export function groupTranscriptMessages(messages: ChatMessage[]): TranscriptMessageGroup[] {
  const groups: TranscriptMessageGroup[] = [];
  let index = 0;

  while (index < messages.length) {
    const message = messages[index];
    if (message.role !== "assistant" && message.role !== "system") {
      groups.push({ type: "message", id: message.id, message });
      index += 1;
      continue;
    }

    const turnMessages: ChatMessage[] = [];
    while (index < messages.length && messages[index].role !== "user") {
      turnMessages.push(messages[index]);
      index += 1;
    }

    if (turnMessages.length === 0) continue;
    const turn = buildAgentTurn(turnMessages);
    groups.push({ type: "agentTurn", id: turn.id, turn });
  }

  return groups;
}
