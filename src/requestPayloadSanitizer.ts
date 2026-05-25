const SENSITIVE_KEYS = new Set([
  "password",
  "secret",
  "token",
  "api_key",
  "apikey",
  "key",
  "env",
  "value",
  "authorization",
  "credential",
]);

const MAX_SUMMARY_LENGTH = 800;

export function redactSensitivePayload(payload: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (payload == null || typeof payload !== "object") return payload;

  if (Array.isArray(payload)) {
    return payload.slice(0, 20).map((entry) => redactSensitivePayload(entry, depth + 1));
  }

  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      next[key] = "[redacted]";
      continue;
    }
    next[key] = redactSensitivePayload(value, depth + 1);
  }
  return next;
}

function truncate(text: string, max = MAX_SUMMARY_LENGTH): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

export function summarizeUnknownRequest(type: string, payload: unknown): string {
  const redacted = redactSensitivePayload(payload);
  let detail = "";
  try {
    detail = truncate(JSON.stringify(redacted));
  } catch {
    detail = "[unserializable payload]";
  }
  return `Unsupported request: ${type}. Open logs for details.${detail ? ` ${detail}` : ""}`;
}
