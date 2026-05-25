export const DOUBLE_ENTER_MS = 600;

const SESSION_BUSY_RE = /session busy|waiting for model response/i;

export function isSessionBusyError(error: unknown): boolean {
  return error instanceof Error && SESSION_BUSY_RE.test(error.message);
}

export function isComposerBusy(
  busy: boolean,
  runtime?: { running?: boolean; blocked?: boolean },
): boolean {
  return busy || Boolean(runtime?.running || runtime?.blocked);
}

export type BusyEmptyEnterAction = "noop" | "interrupt_armed" | "interrupt";

/** Resolve empty Enter presses while Hermes is busy (double-enter stops the turn). */
export function resolveBusyEmptyEnter(
  lastEmptyEnterAt: number,
  now: number = Date.now(),
): { action: BusyEmptyEnterAction; nextLastEmptyEnterAt: number } {
  const doubleTap = lastEmptyEnterAt > 0 && now - lastEmptyEnterAt < DOUBLE_ENTER_MS;
  const nextLastEmptyEnterAt = now;

  if (doubleTap) {
    return { action: "interrupt", nextLastEmptyEnterAt };
  }

  return { action: "interrupt_armed", nextLastEmptyEnterAt };
}

export function isPlainEnterKey(event: {
  key?: string | null;
  nativeEvent?: { key?: string | null; shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean };
}): boolean {
  const native = event.nativeEvent;
  const key = native?.key ?? event.key ?? "";
  if (key !== "Enter" && key !== "\n") return false;
  if (native?.shiftKey || native?.metaKey || native?.ctrlKey || native?.altKey) return false;
  return true;
}
