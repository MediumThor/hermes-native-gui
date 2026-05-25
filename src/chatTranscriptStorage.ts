import { Platform } from "react-native";
import type { ChatMessage } from "./types";

// v2 intentionally ignores older cache entries that could have been written
// under the wrong session id during foreground chat switches.
const STORAGE_KEY = "hermes-native-gui-chat-transcripts-v2";

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
  store[sessionKey] = messages;
  writeStore(store);
}

function messageSignature(messages: ChatMessage[]): string {
  return messages.map((message) => `${message.role}:${message.text}:${message.status ?? ""}`).join("\n");
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
  if (serverSig === cachedSig) return serverMessages;
  if (cachedSig.startsWith(serverSig)) {
    return [...serverMessages, ...cachedMessages.slice(serverMessages.length)];
  }
  if (serverSig.startsWith(cachedSig)) return serverMessages;

  if (cachedMessages.length > serverMessages.length) {
    const tail = cachedMessages.slice(serverMessages.length);
    const missingTail = tail.filter(
      (message) =>
        !serverMessages.some(
          (existing) => existing.role === message.role && existing.text === message.text,
        ),
    );
    if (missingTail.length > 0) return [...serverMessages, ...missingTail];
  }

  const lastCachedUser = [...cachedMessages].reverse().find((message) => message.role === "user");
  if (
    lastCachedUser &&
    !serverMessages.some(
      (message) => message.role === "user" && message.text === lastCachedUser.text,
    )
  ) {
    return [...serverMessages, lastCachedUser];
  }

  return serverMessages.length >= cachedMessages.length ? serverMessages : cachedMessages;
}
