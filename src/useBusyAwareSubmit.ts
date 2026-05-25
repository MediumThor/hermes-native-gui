import { useCallback, useRef } from "react";
import { DOUBLE_ENTER_MS } from "./promptDelivery";

type Options = {
  busy: boolean;
  isBlocked: boolean;
  promptQueue: string[];
  queuePrompt: (text: string) => void;
  steerNextQueuedPrompt: () => Promise<boolean>;
  sendPrompt: (text: string) => Promise<void>;
  interruptSession: () => Promise<void>;
};

export function useBusyAwareSubmit({
  busy,
  isBlocked,
  promptQueue,
  queuePrompt,
  steerNextQueuedPrompt,
  sendPrompt,
  interruptSession,
}: Options) {
  const lastEmptyEnterAt = useRef(0);

  const submitDraft = useCallback(async (
    draft: string,
    options: { hasAttachments?: boolean; fallbackText?: string } = {},
  ) => {
    const text = draft.trim();
    const hasAttachments = Boolean(options.hasAttachments);
    const payload = text || options.fallbackText?.trim() || "";

    if (isBlocked) return { cleared: false as const, action: "blocked" as const };

    if (!busy) {
      if (!payload && !hasAttachments) return { cleared: false as const, action: "noop" as const };
      await sendPrompt(payload || "What do you see in this image?");
      return { cleared: true as const, action: "sent" as const };
    }

    if (!payload) {
      const now = Date.now();
      const doubleTap = now - lastEmptyEnterAt.current < DOUBLE_ENTER_MS;
      lastEmptyEnterAt.current = now;

      if (doubleTap) {
        if (promptQueue.length > 0) {
          await steerNextQueuedPrompt();
          return { cleared: false as const, action: "steered" as const };
        }
        await interruptSession();
        return { cleared: false as const, action: "interrupted" as const };
      }

      return { cleared: false as const, action: "noop" as const };
    }

    lastEmptyEnterAt.current = 0;
    queuePrompt(payload);
    return { cleared: true as const, action: "queued" as const };
  }, [
    busy,
    interruptSession,
    isBlocked,
    promptQueue.length,
    queuePrompt,
    sendPrompt,
    steerNextQueuedPrompt,
  ]);

  return { submitDraft };
}
