import { useCallback, useRef } from "react";
import { resolveBusyEmptyEnter } from "./promptDelivery";

type Options = {
  busy: boolean;
  isBlocked: boolean;
  queuePrompt: (text: string) => void;
  sendPrompt: (text: string) => Promise<void>;
  interruptSession: () => Promise<void>;
  onInterruptArmed?: () => void;
};

export function useBusyAwareSubmit({
  busy,
  isBlocked,
  queuePrompt,
  sendPrompt,
  interruptSession,
  onInterruptArmed,
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
      const { action, nextLastEmptyEnterAt } = resolveBusyEmptyEnter(lastEmptyEnterAt.current);
      lastEmptyEnterAt.current = nextLastEmptyEnterAt;

      if (action === "interrupt") {
        await interruptSession();
        return { cleared: false as const, action: "interrupted" as const };
      }

      onInterruptArmed?.();
      return { cleared: true as const, action: "interrupt_armed" as const };
    }

    lastEmptyEnterAt.current = 0;
    queuePrompt(payload);
    return { cleared: true as const, action: "queued" as const };
  }, [
    busy,
    interruptSession,
    isBlocked,
    onInterruptArmed,
    queuePrompt,
    sendPrompt,
  ]);

  return { submitDraft };
}
