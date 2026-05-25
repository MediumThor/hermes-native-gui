import { Platform } from "react-native";
import type { ChatMessage } from "./types";

export {
  appendSystemTranscriptMessage,
  mergeLiveActivityMessages,
} from "./liveActivityTranscript";

// v3 drops v2 caches that could contain mis-ordered optimistic merge artifacts.
const STORAGE_KEY = "hermes-native-gui-chat-transcripts-v3";

type TranscriptStore = Record<string, ChatMessage[]>;

function readStore(): TranscriptStore {
  if (Platform.OS !== "web" || typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as TranscriptStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: TranscriptStore) {
  if (Platform.OS !== "web" || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore quota / privacy errors.
  }
}

export function loadCachedTranscript(sessionKey: string): ChatMessage[] {
  if (!sessionKey) return [];
  return readStore()[sessionKey] ?? [];
}

export function saveCachedTranscript(sessionKey: string, messages: ChatMessage[]) {
  if (!sessionKey || messages.length === 0) return;
  const store = readStore();
  store[sessionKey] = finalizeTranscriptHistory(messages);
  writeStore(store);
}

export function appendSlashCommandTurn(
  messages: ChatMessage[],
  command: string,
  options: { id?: string; now?: number } = {},
): ChatMessage[] {
  const text = command.trim();
  if (!text) return messages;
  const now = options.now ?? Date.now();
  return [
    ...messages,
    {
      id: options.id ?? `slash-${now}`,
      role: "user",
      text,
      createdAt: now,
    },
  ];
}

function messageSignature(messages: ChatMessage[]): string {
  return messages
    .map((message) => `${message.role}:${message.text}:${message.reasoning ?? ""}:${message.status ?? ""}`)
    .join("\n");
}

function messagesEquivalent(a: ChatMessage, b: ChatMessage): boolean {
  return a.role === b.role && a.text === b.text;
}

function insertMessageByCreatedAt(messages: ChatMessage[], message: ChatMessage): ChatMessage[] {
  const next = [...messages];
  let index = next.findIndex((existing) => existing.createdAt > message.createdAt);
  if (index === -1) index = next.length;
  next.splice(index, 0, message);
  return next;
}

/** Prefer server snapshot, but keep local-only turns not flushed to DB yet. */
export function mergeTranscriptMessages(
  serverMessages: ChatMessage[],
  cachedMessages: ChatMessage[],
): ChatMessage[] {
  if (cachedMessages.length === 0) return serverMessages;
  if (serverMessages.length === 0) return cachedMessages;

  const serverSig = messageSignature(serverMessages);
  const cachedSig = messageSignature(cachedMessages);
  if (serverSig === cachedSig) return enrichTranscriptWithReasoning(serverMessages, cachedMessages);
  if (cachedSig.startsWith(serverSig)) {
    return finalizeMerge(
      [...serverMessages, ...cachedMessages.slice(serverMessages.length)],
      cachedMessages,
    );
  }
  if (serverSig.startsWith(cachedSig)) {
    return enrichTranscriptWithReasoning(serverMessages, cachedMessages);
  }

  if (cachedMessages.length > serverMessages.length) {
    const tail = cachedMessages.slice(serverMessages.length);
    const missingTail = tail.filter(
      (message) =>
        !serverMessages.some(
          (existing) => existing.role === message.role && existing.text === message.text,
        ),
    );
    if (missingTail.length > 0) {
      return finalizeMerge([...serverMessages, ...missingTail], cachedMessages);
    }
  }

  const lastCachedUser = [...cachedMessages].reverse().find((message) => message.role === "user");
  if (
    lastCachedUser &&
    !serverMessages.some(
      (message) => message.role === "user" && message.text === lastCachedUser.text,
    )
  ) {
    return finalizeMerge(
      insertMissingUserTurn(serverMessages, lastCachedUser, cachedMessages),
      cachedMessages,
    );
  }

  return finalizeMerge(serverMessages, cachedMessages);
}

/** Fill missing reasoning on server/history rows from a richer local transcript. */
export function enrichTranscriptWithReasoning(
  messages: ChatMessage[],
  donor: ChatMessage[],
): ChatMessage[] {
  if (donor.length === 0) return messages;

  const donorAssistants = donor.filter(
    (entry) => entry.role === "assistant" && entry.reasoning?.trim(),
  );

  let assistantIndex = -1;
  return messages.map((message) => {
    if (message.reasoning?.trim()) return message;
    if (message.role !== "assistant") return message;

    assistantIndex += 1;
    const donorByTurn = donorAssistants[assistantIndex];
    if (donorByTurn?.reasoning?.trim()) {
      return { ...message, reasoning: donorByTurn.reasoning };
    }

    const exact = donor.find(
      (entry) =>
        entry.role === message.role &&
        entry.text === message.text &&
        entry.reasoning?.trim(),
    );
    if (exact) return { ...message, reasoning: exact.reasoning };

    const fuzzy = donor.find(
      (entry) =>
        entry.role === "assistant" &&
        entry.reasoning?.trim() &&
        (!message.text.trim() ||
          !entry.text.trim() ||
          message.text === entry.text ||
          message.text.startsWith(entry.text) ||
          entry.text.startsWith(message.text)),
    );
    if (fuzzy) return { ...message, reasoning: fuzzy.reasoning };

    return message;
  });
}

/** Merge consecutive assistant rows that only carry reasoning fragments. */
export function coalesceAssistantReasoningTurns(messages: ChatMessage[]): ChatMessage[] {
  const result: ChatMessage[] = [];

  for (const message of messages) {
    const prev = result[result.length - 1];
    const reasoningOnly =
      message.role === "assistant" &&
      Boolean(message.reasoning?.trim()) &&
      !message.text?.trim();
    const prevReasoningOnly =
      prev?.role === "assistant" &&
      Boolean(prev.reasoning?.trim()) &&
      !prev.text?.trim();

    if (prev && prevReasoningOnly && reasoningOnly) {
      result[result.length - 1] = {
        ...prev,
        reasoning: `${prev.reasoning ?? ""}${message.reasoning ?? ""}`,
        status:
          prev.status === "streaming" || message.status === "streaming"
            ? "streaming"
            : message.status ?? prev.status ?? "complete",
      };
      continue;
    }

    result.push(message);
  }

  return result;
}

function finalizeMerge(
  serverMessages: ChatMessage[],
  cachedMessages: ChatMessage[],
): ChatMessage[] {
  const preferred =
    serverMessages.length >= cachedMessages.length ? serverMessages : cachedMessages;
  const donor =
    serverMessages.length >= cachedMessages.length ? cachedMessages : serverMessages;
  return finalizeTranscriptHistory(enrichTranscriptWithReasoning(preferred, donor));
}

/** Prefer server/history order and fold in local-only rows without letting cache reorder turns. */
export function reconcileTranscriptHistory(
  serverMessages: ChatMessage[],
  localMessages: ChatMessage[],
): ChatMessage[] {
  const canonical = serverMessages.length > 0 ? [...serverMessages] : [...localMessages];
  const supplement = serverMessages.length > 0 ? localMessages : [];
  if (supplement.length === 0) {
    return finalizeTranscriptHistory(canonical);
  }

  let merged = canonical;
  for (const message of supplement) {
    if (merged.some((existing) => messagesEquivalent(existing, message))) continue;
    if (message.role === "user") {
      merged = insertMissingUserTurn(merged, message, supplement);
      continue;
    }
    merged = insertMessageByCreatedAt(merged, message);
  }
  return finalizeTranscriptHistory(merged);
}

/** Fix user prompts that were merged or cached after the assistant reply they triggered. */
export function repairConversationOrder(messages: ChatMessage[]): ChatMessage[] {
  let result = [...messages];
  let changed = true;

  while (changed) {
    changed = false;
    for (let index = 1; index < result.length; index += 1) {
      const current = result[index];
      const previous = result[index - 1];
      if (
        current.role === "user" &&
        previous.role === "assistant" &&
        current.createdAt <= previous.createdAt
      ) {
        result.splice(index - 1, 0, current);
        result.splice(index + 1, 1);
        changed = true;
        break;
      }
    }
  }

  const firstAssistantIndex = result.findIndex(
    (message) => message.role === "assistant" && Boolean(message.text?.trim()),
  );
  if (firstAssistantIndex > 0) {
    return result;
  }
  if (firstAssistantIndex < 0) {
    return result;
  }

  const openingUserIndex = result.findIndex(
    (message, index) =>
      index > firstAssistantIndex &&
      message.role === "user" &&
      !result.slice(0, firstAssistantIndex).some((entry) => entry.role === "user") &&
      message.createdAt <= result[firstAssistantIndex].createdAt,
  );
  if (openingUserIndex <= firstAssistantIndex) {
    return result;
  }

  const next = [...result];
  const [openingUser] = next.splice(openingUserIndex, 1);
  next.splice(firstAssistantIndex, 0, openingUser);
  return next;
}

export function finalizeTranscriptHistory(messages: ChatMessage[]): ChatMessage[] {
  return repairConversationOrder(
    sortTranscriptChronologically(coalesceAssistantReasoningTurns(messages)),
  );
}

function insertMissingUserTurn(
  serverMessages: ChatMessage[],
  userMessage: ChatMessage,
  cachedMessages: ChatMessage[],
): ChatMessage[] {
  const userIndex = cachedMessages.findIndex(
    (message) => message.role === "user" && message.text === userMessage.text,
  );
  const followingAssistant = cachedMessages
    .slice(userIndex + 1)
    .find((message) => message.role === "assistant");
  if (!followingAssistant) {
    return [...serverMessages, userMessage];
  }

  const serverAssistantIndex = serverMessages.findIndex(
    (message) =>
      message.role === "assistant" &&
      (message.text === followingAssistant.text ||
        (Boolean(message.text?.trim()) &&
          Boolean(followingAssistant.text?.trim()) &&
          (message.text.startsWith(followingAssistant.text) ||
            followingAssistant.text.startsWith(message.text)))),
  );
  if (serverAssistantIndex === -1) {
    return [...serverMessages, userMessage];
  }

  return [
    ...serverMessages.slice(0, serverAssistantIndex),
    userMessage,
    ...serverMessages.slice(serverAssistantIndex),
  ];
}

/** Keep optimistic/local turns in conversational order when merging with server history. */
export function sortTranscriptChronologically(messages: ChatMessage[]): ChatMessage[] {
  return [...messages]
    .map((message, index) => ({ message, index }))
    .sort((a, b) => {
      const timeDiff = a.message.createdAt - b.message.createdAt;
      if (timeDiff !== 0) return timeDiff;
      return a.index - b.index;
    })
    .map(({ message }) => message);
}

/** Merge two transcript views without dropping the richer history. */
export function pickRicherTranscript(
  primary: ChatMessage[],
  secondary: ChatMessage[],
): ChatMessage[] {
  if (primary.length === 0) return secondary;
  if (secondary.length === 0) return primary;
  const mergedPrimary = mergeTranscriptMessages(primary, secondary);
  const mergedSecondary = mergeTranscriptMessages(secondary, primary);
  if (mergedPrimary.length > mergedSecondary.length) return mergedPrimary;
  if (mergedSecondary.length > mergedPrimary.length) return mergedSecondary;
  return mergedPrimary.length >= primary.length ? mergedPrimary : mergedSecondary;
}
