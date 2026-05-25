import type { ChatMessage } from "./types";

const ASK_MODE_PREFIX =
  /^You are in Ask mode\..+?(?:\n\n|\n)/s;

/** Turn the opening user prompt into a short session title for fleet views. */
export function purposeTitleFromPrompt(text: string, maxLength = 72): string {
  let cleaned = text.trim();
  if (!cleaned) return "";
  cleaned = cleaned.replace(ASK_MODE_PREFIX, "").trim();
  cleaned = cleaned.replace(/^\/plan\s+/i, "").trim();
  cleaned = cleaned.replace(/\s+/g, " ");
  if (!cleaned) return "";
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1).trimEnd()}…`;
}

export function firstUserMessageTitle(messages: ChatMessage[]): string {
  const first = messages.find((message) => message.role === "user" && message.text?.trim());
  return first ? purposeTitleFromPrompt(first.text) : "";
}

export function resolveSessionPurposeTitle(
  sessionId: string,
  options: {
    serverTitle?: string;
    purposeTitles?: Record<string, string>;
    aliasIds?: string[];
    transcript?: ChatMessage[];
  } = {},
): string {
  const candidates = [sessionId, ...(options.aliasIds ?? [])].filter(Boolean);
  const serverTitle = options.serverTitle?.trim();
  if (serverTitle && !/^Running · /i.test(serverTitle) && serverTitle !== "Current chat") {
    return serverTitle;
  }
  for (const id of candidates) {
    const purpose = options.purposeTitles?.[id]?.trim();
    if (purpose) return purpose;
  }
  const fromTranscript = options.transcript ? firstUserMessageTitle(options.transcript) : "";
  if (fromTranscript) return fromTranscript;
  return "";
}

export function aliasPurposeTitles(
  purposeTitles: Record<string, string>,
  gatewayId: string,
  dbKey: string,
): Record<string, string> {
  const title = purposeTitles[gatewayId] ?? purposeTitles[dbKey];
  if (!title) return purposeTitles;
  return {
    ...purposeTitles,
    [gatewayId]: title,
    [dbKey]: title,
  };
}
