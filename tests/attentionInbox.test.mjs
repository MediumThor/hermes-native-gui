import assert from "node:assert/strict";

const {
  attentionRequestFromEvent,
  removeAttentionRequest,
  upsertAttentionRequest,
} = globalThis.loadTsModule("./src/attentionInbox.ts");

const now = 1_714_000_000_000;

{
  const request = attentionRequestFromEvent("approval.request", {
    command: "rm -rf dist",
    description: "Delete build output",
  }, "gw-123", now);

  assert.equal(request.kind, "approval");
  assert.equal(request.sessionId, "gw-123");
  assert.equal(request.title, "Approval needed");
  assert.match(request.preview, /rm -rf dist/);
  assert.equal(request.createdAt, now);
  assert.equal(request.id, "gw-123:approval:rm -rf dist");
}

{
  const request = attentionRequestFromEvent("clarify.request", {
    request_id: "clarify-1",
    question: "Which provider?",
    choices: ["OpenAI", "Anthropic"],
  }, "gw-abc", now);

  assert.equal(request.kind, "clarify");
  assert.equal(request.requestId, "clarify-1");
  assert.equal(request.description, "Which provider?");
  assert.deepEqual(request.choices, ["OpenAI", "Anthropic"]);
  assert.equal(request.id, "gw-abc:clarify:clarify-1");
}

{
  const request = attentionRequestFromEvent("secret.request", {
    request_id: "secret-1",
    env_var: "OPENAI_API_KEY",
    prompt: "Enter API key",
  }, "gw-secret", now);

  assert.equal(request.kind, "secret");
  assert.equal(request.title, "Secret input needed");
  assert.equal(request.requestId, "secret-1");
  assert.match(request.preview, /OPENAI_API_KEY/);
}

{
  const first = attentionRequestFromEvent("approval.request", { command: "npm install" }, "s1", now);
  const updated = attentionRequestFromEvent("approval.request", { command: "npm install", description: "Install deps" }, "s1", now + 1);
  const list = upsertAttentionRequest(upsertAttentionRequest([], first), updated);
  assert.equal(list.length, 1);
  assert.equal(list[0].description, "Install deps");
  assert.equal(list[0].createdAt, now + 1);
}

{
  const a = attentionRequestFromEvent("sudo.request", { request_id: "sudo-1" }, "s1", now);
  const b = attentionRequestFromEvent("secret.request", { request_id: "secret-1", env_var: "TOKEN" }, "s2", now);
  const list = [a, b];
  assert.deepEqual(removeAttentionRequest(list, a.id).map((item) => item.id), [b.id]);
}
