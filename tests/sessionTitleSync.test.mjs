import assert from "node:assert/strict";

const {
  inferTitleFromSessionContext,
  isGenericSessionLabel,
  normalizeGatewaySessionTitle,
  resolveFleetSessionLabel,
  shouldSyncSessionTitle,
} = globalThis.loadTsModule("./src/sessionTitleSync.ts");

{
  assert.equal(isGenericSessionLabel("Agent · 20260525", "20260525_abc"), true);
  assert.equal(isGenericSessionLabel("Fix fleet cards", "db-a"), false);
  assert.equal(isGenericSessionLabel("Running · abc123"), true);
  assert.equal(normalizeGatewaySessionTitle("Running · abc123"), "");
  assert.equal(normalizeGatewaySessionTitle("Refactor sidebar"), "Refactor sidebar");
}

{
  const inferred = inferTitleFromSessionContext({
    subagents: [{ id: "s1", goal: "Research OAuth providers for login flow", index: 0, depth: 0, parentId: null, status: "running", thinking: [], tools: [], notes: [], toolCount: 0, taskCount: 0 }],
    runtimeActivity: "Working…",
  });
  assert.match(inferred, /OAuth providers/i);
}

{
  const label = resolveFleetSessionLabel("db-a", {
    sessions: [{ id: "db-a", title: "Running · abc123" }],
    purposeTitles: {},
    aliasIds: ["gw-a"],
    context: {
      transcript: [
        { id: "u1", role: "user", text: "Compare Postgres hosting options", createdAt: 1 },
      ],
    },
  });
  assert.equal(label, "Compare Postgres hosting options");
}

{
  assert.equal(
    shouldSyncSessionTitle("db-a", {
      purposeTitles: { "gw-a": "Already titled" },
      aliasIds: ["gw-a"],
    }),
    false,
  );
  assert.equal(
    shouldSyncSessionTitle("20260525", {
      purposeTitles: {},
      aliasIds: ["gw-a"],
      context: { runtimeActivity: "Working…" },
    }),
    true,
  );
}
