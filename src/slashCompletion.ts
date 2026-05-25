import type { SlashCompletionItem } from "./types";

export function applySlashCompletionToDraft(
  draft: string,
  item: SlashCompletionItem,
  replaceFrom?: number,
): string {
  const start = replaceFrom ?? (draft.includes(" ") ? draft.lastIndexOf(" ") + 1 : 1);
  const prefix = draft.slice(0, start);
  const completion = start === 1 && item.text.startsWith("/") ? item.text.slice(1) : item.text;
  return `${prefix}${completion}`.trimEnd() + " ";
}
