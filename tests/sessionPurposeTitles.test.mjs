import assert from "node:assert/strict";

const {
  aliasPurposeTitles,
  firstUserMessageTitle,
  purposeTitleFromPrompt,
  resolveSessionPurposeTitle,
} = globalThis.loadTsModule("./src/sessionPurposeTitles.ts");

{
  assert.equal(purposeTitleFromPrompt("  Fix the fleet card titles  "), "Fix the fleet card titles");
  assert.equal(purposeTitleFromPrompt("/plan Add OAuth login flow"), "Add OAuth login flow");
  assert.equal(
    purposeTitleFromPrompt("You are in Ask mode. Answer briefly.\n\nWhat is Hermes?"),
    "What is Hermes?",
  );
  const long = "a".repeat(100);
  assert.match(purposeTitleFromPrompt(long), /…$/);
  assert.ok(purposeTitleFromPrompt(long).length <= 72);
}

{
  const messages = [
    { id: "s1", role: "system", text: "boot", createdAt: 1 },
    { id: "u1", role: "user", text: "Research pricing APIs", createdAt: 2 },
  ];
  assert.equal(firstUserMessageTitle(messages), "Research pricing APIs");
}

{
  assert.equal(
    resolveSessionPurposeTitle("db-a", {
      serverTitle: "Running · abc123",
      purposeTitles: { "gw-a": "Implement OAuth" },
      aliasIds: ["gw-a"],
    }),
    "Implement OAuth",
  );
  assert.equal(
    resolveSessionPurposeTitle("db-a", {
      serverTitle: "Current chat",
      purposeTitles: { "db-a": "Review PR #42" },
    }),
    "Review PR #42",
  );
}

{
  const aliased = aliasPurposeTitles(
    { "gw-a": "Spawned goal" },
    "gw-a",
    "db-a",
  );
  assert.equal(aliased["gw-a"], "Spawned goal");
  assert.equal(aliased["db-a"], "Spawned goal");
}
