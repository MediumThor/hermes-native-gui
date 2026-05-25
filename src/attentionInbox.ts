export type AttentionKind = "approval" | "clarify" | "sudo" | "secret";

export type AttentionRequest = {
  id: string;
  sessionId: string;
  kind: AttentionKind;
  title: string;
  description: string;
  preview: string;
  createdAt: number;
  requestId?: string;
  command?: string;
  choices?: string[] | null;
  envVar?: string;
  prompt?: string;
};

function stableToken(value: unknown, fallback: string): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function requestIdFor(kind: AttentionKind, payload: Record<string, unknown>, fallback: string): string {
  return stableToken(
    payload.request_id ?? payload.requestId ?? payload.command ?? payload.question ?? payload.env_var,
    fallback,
  );
}

function normalizeChoices(value: unknown): string[] | null | undefined {
  if (value == null) return undefined;
  return Array.isArray(value) ? value.map(String) : null;
}

export function attentionRequestFromEvent(
  eventType: string,
  payload: Record<string, unknown>,
  sessionId: string,
  now = Date.now(),
): AttentionRequest {
  const normalizedSession = stableToken(sessionId, "unknown-session");

  if (eventType === "approval.request") {
    const command = String(payload.command ?? "");
    const description = String(payload.description ?? "Review the requested action before allowing it.");
    const token = requestIdFor("approval", payload, String(now));
    return {
      id: `${normalizedSession}:approval:${token}`,
      sessionId: normalizedSession,
      kind: "approval",
      title: "Approval needed",
      description,
      preview: command || description,
      command,
      createdAt: now,
    };
  }

  if (eventType === "clarify.request") {
    const requestId = requestIdFor("clarify", payload, String(now));
    const question = String(payload.question ?? "Hermes needs clarification.");
    return {
      id: `${normalizedSession}:clarify:${requestId}`,
      sessionId: normalizedSession,
      kind: "clarify",
      title: "Clarification needed",
      description: question,
      preview: question,
      requestId,
      choices: normalizeChoices(payload.choices) ?? null,
      createdAt: now,
    };
  }

  if (eventType === "sudo.request") {
    const requestId = requestIdFor("sudo", payload, String(now));
    return {
      id: `${normalizedSession}:sudo:${requestId}`,
      sessionId: normalizedSession,
      kind: "sudo",
      title: "Sudo password needed",
      description: "Hermes is waiting for a sudo password.",
      preview: "Password entry required",
      requestId,
      createdAt: now,
    };
  }

  if (eventType === "secret.request") {
    const requestId = requestIdFor("secret", payload, String(now));
    const envVar = String(payload.env_var ?? payload.envVar ?? "secret");
    const prompt = String(payload.prompt ?? "Secret input required");
    return {
      id: `${normalizedSession}:secret:${requestId}`,
      sessionId: normalizedSession,
      kind: "secret",
      title: "Secret input needed",
      description: prompt,
      preview: `${envVar}: ${prompt}`,
      requestId,
      envVar,
      prompt,
      createdAt: now,
    };
  }

  return {
    id: `${normalizedSession}:unknown:${now}`,
    sessionId: normalizedSession,
    kind: "clarify",
    title: "Input needed",
    description: "Hermes is waiting for input.",
    preview: eventType,
    createdAt: now,
  };
}

export function upsertAttentionRequest(
  requests: readonly AttentionRequest[],
  request: AttentionRequest,
): AttentionRequest[] {
  const existingIndex = requests.findIndex((item) => item.id === request.id);
  if (existingIndex === -1) return [request, ...requests];
  return requests.map((item, index) => (index === existingIndex ? request : item));
}

export function removeAttentionRequest(
  requests: readonly AttentionRequest[],
  requestId: string,
): AttentionRequest[] {
  return requests.filter((item) => item.id !== requestId);
}

export function removeAttentionForSession(
  requests: readonly AttentionRequest[],
  sessionId: string,
  kind?: AttentionKind,
): AttentionRequest[] {
  return requests.filter((item) => {
    if (item.sessionId !== sessionId) return true;
    return kind ? item.kind !== kind : false;
  });
}

export function attentionSessionLabel(
  request: AttentionRequest,
  title?: string | null,
): string {
  const label = title?.trim();
  if (label) return label;
  return request.sessionId.slice(0, 8);
}
