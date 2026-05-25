import assert from "node:assert/strict";

const {
  allSubagentsTerminal,
  buildMissionTimeline,
  collectMissionArtifacts,
  createMissionSummary,
  joinSubagentSummaries,
} = globalThis.loadTsModule("./src/missionTimeline.ts");

const subagents = [
  {
    id: "lead-child-1",
    goal: "Inspect UI",
    index: 0,
    depth: 0,
    parentId: null,
    status: "completed",
    thinking: ["checking layout"],
    tools: ["read_file: App.tsx", "browser_snapshot"],
    notes: ["found sidebar issue"],
    summary: "UI inspection complete",
    toolCount: 2,
    taskCount: 1,
    durationSeconds: 18,
    filesRead: ["App.tsx"],
    filesWritten: [],
    startedAt: 1000,
  },
  {
    id: "lead-child-2",
    goal: "Patch bridge",
    index: 1,
    depth: 0,
    parentId: null,
    status: "failed",
    thinking: [],
    tools: ["patch: bridge.py"],
    notes: ["permission denied"],
    summary: "Bridge patch failed",
    toolCount: 1,
    taskCount: 1,
    durationSeconds: 7,
    filesRead: ["server/bridge.py"],
    filesWritten: ["server/bridge.py"],
    startedAt: 2000,
  },
];

{
  const timeline = buildMissionTimeline(subagents);
  assert.equal(timeline[0].stage, "delegating");
  assert.ok(timeline.some((entry) => entry.stage === "tool" && entry.title.includes("Tool use")));
  assert.ok(timeline.some((entry) => entry.stage === "completed" && entry.status === "failed"));
  assert.ok(timeline.some((entry) => entry.stage === "progress" && entry.detail.includes("permission denied")));
}

{
  const artifacts = collectMissionArtifacts(subagents);
  assert.deepEqual(artifacts.filesRead.sort(), ["App.tsx", "server/bridge.py"].sort());
  assert.deepEqual(artifacts.filesWritten, ["server/bridge.py"]);
  assert.equal(artifacts.toolCount, 3);
  assert.equal(artifacts.failureCount, 1);
  assert.equal(artifacts.summaries.length, 2);
}

{
  const summary = createMissionSummary("session-1", "My session", subagents, 3_000);
  assert.equal(summary.sessionId, "session-1");
  assert.equal(summary.status, "failed");
  assert.equal(summary.agentCount, 2);
  assert.equal(summary.toolCount, 3);
  assert.equal(summary.filesTouched, 2);
  assert.match(summary.summaryText, /UI inspection complete/);
  assert.match(summary.summaryText, /Bridge patch failed/);
  assert.equal(summary.completedAt, 3_000);
}

{
  assert.equal(
    joinSubagentSummaries(subagents),
    "UI inspection complete\n\nBridge patch failed",
  );
  assert.equal(allSubagentsTerminal(subagents), true);
  assert.equal(allSubagentsTerminal([{ ...subagents[0], status: "running" }]), false);
}
