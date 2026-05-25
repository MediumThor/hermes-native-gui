import assert from "node:assert/strict";

const {
  buildAgentTurn,
  groupTranscriptMessages,
  mergeThoughtParts,
} = globalThis.loadTsModule("./src/chatMessageGroups.ts");
const {
  serializeAgentAction,
} = globalThis.loadTsModule("./src/agentActivity.ts");

const base = Date.now();
const toolAction = serializeAgentAction({
  kind: "tool",
  title: "Reading a file",
  detail: "App.tsx",
  status: "running",
});
const commandAction = serializeAgentAction({
  kind: "tool",
  title: "Running a command",
  detail: "npm test",
  status: "running",
});

{
  assert.equal(
    mergeThoughtParts(["(🛡️) sizing the field...", "(⚔️) raising the shield..."]),
    "(🛡️) sizing the field...\n(⚔️) raising the shield...",
  );
  assert.equal(
    mergeThoughtParts(["alpha", "alpha beta"]),
    "alpha beta",
  );
}

{
  const turn = buildAgentTurn([
    { id: "a1", role: "assistant", text: "", reasoning: "(🛡️) sizing the field...", status: "complete", createdAt: 1 },
    { id: "s1", role: "system", text: toolAction, createdAt: 2 },
    { id: "a2", role: "assistant", text: "", reasoning: "(⚔️) raising the shield...", status: "streaming", createdAt: 3 },
    { id: "s2", role: "system", text: commandAction, createdAt: 4 },
    { id: "a3", role: "assistant", text: "All done.", status: "complete", createdAt: 5 },
  ]);

  assert.deepEqual(
    turn.segments.map((segment) => segment.type),
    ["thought", "activity", "thought", "activity", "response"],
  );
  assert.match(turn.segments[0].text, /sizing the field/);
  assert.match(turn.segments[2].text, /raising the shield/);
  assert.equal(turn.segments[4].message.text, "All done.");
}

const messages = [
  { id: "u1", role: "user", text: "start", createdAt: base },
  { id: "a1", role: "assistant", text: "", reasoning: "thinking", status: "complete", createdAt: base + 1 },
  { id: "s1", role: "system", text: toolAction, createdAt: base + 2 },
  { id: "a2", role: "assistant", text: "done", createdAt: base + 3 },
];

const groups = groupTranscriptMessages(messages);
assert.equal(groups.length, 2);
assert.equal(groups[0].type, "message");
assert.equal(groups[1].type, "agentTurn");
assert.deepEqual(
  groups[1].turn.segments.map((segment) => segment.type),
  ["thought", "activity", "response"],
);
assert.match(groups[1].turn.segments[0].text, /thinking/);
assert.equal(groups[1].turn.segments[2].message.text, "done");
