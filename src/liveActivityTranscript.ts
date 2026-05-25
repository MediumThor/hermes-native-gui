import type { ChatMessage } from "./types";

/** Finalize a streaming assistant bubble so live activity can appear after its reasoning. */
export function pauseStreamingAssistantForLiveActivity(messages: ChatMessage[]): ChatMessage[] {
  let lastStreamingIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant" && message.status === "streaming") {
      lastStreamingIndex = index;
      break;
    }
  }
  if (lastStreamingIndex < 0) return messages;

  return messages.map((message, index) =>
    index === lastStreamingIndex ? { ...message, status: "complete" as const } : message,
  );
}

function systemMessageDuplicate(messages: ChatMessage[], line: string): boolean {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "system") return false;
  if (last.text === line) return true;
  return last.text
    .split("\n")
    .some((entry) => entry.replace(/^•\s*/, "").trim() === line);
}

/** Append a live system/activity line, skipping empty or duplicate consecutive rows. */
export function appendSystemTranscriptMessage(
  messages: ChatMessage[],
  text: string,
  status?: ChatMessage["status"],
): ChatMessage[] {
  const trimmed = text.trim();
  if (!trimmed) return messages;
  if (systemMessageDuplicate(messages, trimmed)) return messages;

  const paused = pauseStreamingAssistantForLiveActivity(messages);
  return [
    ...paused,
    {
      id: `system-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      role: "system",
      text: trimmed,
      status,
      createdAt: Date.now(),
    },
  ];
}

/** Keep live system activity rows when polling replaces the transcript from the server. */
export function mergeLiveActivityMessages(
  serverMessages: ChatMessage[],
  liveMessages: ChatMessage[],
): ChatMessage[] {
  const knownSystem = new Set(
    serverMessages
      .filter((message) => message.role === "system" && message.text?.trim())
      .map((message) => message.text),
  );

  const extras = liveMessages.filter(
    (message) =>
      message.role === "system" &&
      message.text?.trim() &&
      !knownSystem.has(message.text),
  );
  if (extras.length === 0) return serverMessages;

  let result = [...serverMessages];
  for (const message of extras) {
    result = appendSystemTranscriptMessage(result, message.text, message.status);
    knownSystem.add(message.text);
  }
  return result;
}
