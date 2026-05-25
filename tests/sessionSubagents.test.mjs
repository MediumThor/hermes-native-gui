import assert from "node:assert/strict";

const {
  applySubagentEventForSession,
  stashSubagentsForSession,
  subagentsForAliases,
} = globalThis.loadTsModule("./src/sessionSubagents.ts");

const baseItem = {
  id: "sa-1",
  goal: "Research APIs",
  index: 0,
  depth: 0,
  parentId: null,
  status: "running",
  thinking: [],
  tools: [],
  notes: [],
  toolCount: 0,
  taskCount: 1,
};

{
  const next = applySubagentEventForSession({}, ["gw-a", "db-a"], "subagent.start", {
    subagent_id: "sa-1",
    goal: "Research APIs",
    task_index: 0,
    depth: 0,
    parent_id: null,
  });
  assert.equal(next["gw-a"]?.length, 1);
  assert.equal(next["db-a"]?.length, 1);
  assert.equal(next["gw-a"]?.[0]?.goal, "Research APIs");
}

{
  const stored = stashSubagentsForSession({}, ["gw-a"], [baseItem]);
  assert.equal(subagentsForAliases(stored, ["db-a", "gw-a"]).length, 1);
}
