export const DOUBLE_ENTER_MS = 450;

const SESSION_BUSY_RE = /session busy|waiting for model response/i;

export function isSessionBusyError(error: unknown): boolean {
  return error instanceof Error && SESSION_BUSY_RE.test(error.message);
}
