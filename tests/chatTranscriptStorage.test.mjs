import assert from "node:assert/strict";

const {
  appendSystemTranscriptMessage,
  mergeLiveActivityMessages,
  pauseStreamingAssistantForLiveActivity,
} = globalThis.loadTsModule("./src/liveActivityTranscript.ts");

{
  const base = [{ id: "u1", role: "user", text: "hi", createdAt: 1 }];
  const next = appendSystemTranscriptMessage(base, "git status --short --branch");
  assert.equal(next.length, 2);
  assert.equal(next[1].role, "system");
  assert.equal(next[1].text, "git status --short --branch");
}

{
  const base = [
    { id: "u1", role: "user", text: "hi", createdAt: 1 },
    { id: "s1", role: "system", text: "git status --short --branch", createdAt: 2 },
  ];
  const next = appendSystemTranscriptMessage(base, "git status --short --branch");
  assert.equal(next, base);
}

{
  const base = [
    { id: "a1", role: "assistant", text: "", reasoning: "First thought", status: "streaming", createdAt: 1 },
  ];
  const next = appendSystemTranscriptMessage(base, "file:///tmp/a.ts");
  assert.equal(next.length, 2);
  assert.equal(next[0].status, "complete");
  assert.equal(next[1].role, "system");
}

{
  const base = [
    { id: "s1", role: "system", text: "file:///tmp/a.ts", createdAt: 1 },
  ];
  const next = appendSystemTranscriptMessage(base, "file:///tmp/b.ts");
  assert.equal(next.length, 2);
  assert.equal(next[1].text, "file:///tmp/b.ts");
}

{
  const paused = pauseStreamingAssistantForLiveActivity([
    { id: "a1", role: "assistant", text: "", reasoning: "thinking", status: "streaming", createdAt: 1 },
  ]);
  assert.equal(paused[0].status, "complete");
}

{
  const server = [
    { id: "u1", role: "user", text: "hi", createdAt: 1 },
    { id: "a1", role: "assistant", text: "working", status: "complete", createdAt: 2 },
  ];
  const live = [
    ...server,
    { id: "s1", role: "system", text: "git status --short --branch", createdAt: 3 },
    {
      id: "a2",
      role: "assistant",
      text: "",
      reasoning: "Checking repo state",
      status: "streaming",
      createdAt: 4,
    },
  ];
  const merged = mergeLiveActivityMessages(server, live);
  assert.equal(merged.length, 3);
  assert.equal(merged[2].role, "system");
  assert.equal(merged[2].text, "git status --short --branch");
}
