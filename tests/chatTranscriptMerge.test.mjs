import assert from "node:assert/strict";
import Module from "node:module";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "react-native") {
    return { Platform: { OS: "web" } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const {
  appendSlashCommandTurn,
  mergeTranscriptMessages,
  reconcileTranscriptHistory,
  repairConversationOrder,
  finalizeTranscriptHistory,
} = globalThis.loadTsModule("./src/chatTranscriptStorage.ts");

{
  const base = [{ id: "u1", role: "user", text: "hi", createdAt: 1, status: "complete" }];
  const next = appendSlashCommandTurn(base, "/terminal hermes computer-use status", {
    id: "slash-1",
    now: 2,
  });
  assert.equal(next.length, 2);
  assert.equal(next[1].id, "slash-1");
  assert.equal(next[1].role, "user");
  assert.equal(next[1].text, "/terminal hermes computer-use status");
  assert.equal(next[1].createdAt, 2);
}

{
  const server = [
    { id: "u1", role: "user", text: "dark theme is flat", createdAt: 1, status: "complete" },
    {
      id: "a1",
      role: "assistant",
      text: "Here is the plan to refine the dark theme.",
      createdAt: 3,
      status: "complete",
    },
  ];
  const cached = [
    ...server.slice(0, 1),
    { id: "u2", role: "user", text: "go for it", createdAt: 2, status: "complete" },
    {
      id: "a1",
      role: "assistant",
      text: "Here is the plan to refine the dark theme.",
      createdAt: 3,
      status: "complete",
    },
  ];
  const merged = mergeTranscriptMessages(server, cached);
  assert.equal(merged[1].text, "go for it");
  assert.equal(merged[2].text, "Here is the plan to refine the dark theme.");
}

{
  const server = [
    { id: "u1", role: "user", text: "make the dark theme richer", createdAt: 10, status: "complete" },
    {
      id: "a1",
      role: "assistant",
      text: "I will refine the dark theme with glass surfaces.",
      createdAt: 20,
      status: "complete",
    },
  ];
  const cache = [
    {
      id: "a1",
      role: "assistant",
      text: "I will refine the dark theme with glass surfaces.",
      createdAt: 20,
      status: "complete",
    },
    { id: "u1", role: "user", text: "make the dark theme richer", createdAt: 10, status: "complete" },
  ];
  const merged = reconcileTranscriptHistory(server, cache);
  assert.equal(merged[0].text, "make the dark theme richer");
  assert.equal(merged[1].text, "I will refine the dark theme with glass surfaces.");
}

{
  const inverted = [
    {
      id: "a1",
      role: "assistant",
      text: "Plan for the inbox feature.",
      createdAt: 20,
      status: "complete",
    },
    { id: "u1", role: "user", text: "build the inbox", createdAt: 10, status: "complete" },
  ];
  const repaired = repairConversationOrder(inverted);
  assert.equal(repaired[0].text, "build the inbox");
  assert.equal(repaired[1].text, "Plan for the inbox feature.");
}

{
  const followUp = [
    {
      id: "a1",
      role: "assistant",
      text: "Plan for the inbox feature.",
      createdAt: 20,
      status: "complete",
    },
    { id: "u2", role: "user", text: "go for it", createdAt: 30, status: "complete" },
  ];
  const repaired = finalizeTranscriptHistory(followUp);
  assert.equal(repaired[0].text, "Plan for the inbox feature.");
  assert.equal(repaired[1].text, "go for it");
}
