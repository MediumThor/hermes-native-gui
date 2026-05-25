import assert from "node:assert/strict";

const {
  dedupeSessionList,
  pickCanonicalSessionSummary,
  sessionConversationFingerprint,
} = globalThis.loadTsModule("./src/sessionListDedup.ts");

{
  const preview = "Implement the Needs Attention Inbox roadmap item in /Users/ryan/Desktop";
  const sessions = [
    {
      id: "20260525_024434_c7bdad",
      title: "",
      preview,
      started_at: 1,
      last_response_at: 10,
      message_count: 23,
      source: "tui",
    },
    {
      id: "20260525_024403_22a2d1",
      title: "",
      preview,
      started_at: 2,
      last_response_at: 20,
      message_count: 45,
      source: "tui",
    },
    {
      id: "20260525_024232_4d1a0b",
      title: "",
      preview,
      started_at: 3,
      last_response_at: 30,
      message_count: 75,
      source: "tui",
    },
  ];

  assert.equal(sessionConversationFingerprint(sessions[0]), sessionConversationFingerprint(sessions[1]));
  const deduped = dedupeSessionList(sessions);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]?.id, "20260525_024232_4d1a0b");
  assert.equal(deduped[0]?.duplicateCount, 3);
}

{
  const winner = pickCanonicalSessionSummary(
    [
      { id: "a", title: "", preview: "x", started_at: 1, last_response_at: 1, message_count: 5, source: "tui" },
      { id: "b", title: "", preview: "x", started_at: 2, last_response_at: 2, message_count: 10, source: "tui" },
    ],
    (id) => (id === "a" ? { running: true, blocked: false, activity: "Working", updatedAt: 99 } : undefined),
  );
  assert.equal(winner.id, "a");
}
