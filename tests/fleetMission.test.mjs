import assert from "node:assert/strict";

const {
  FLEET_NEW_AGENT_TARGET,
  buildFleetSnapshot,
  fleetFocusTargetId,
  fleetPromptTargetOptions,
  fleetTargetGatewayId,
  resolveLiveGatewayForTarget,
} = globalThis.loadTsModule("./src/fleetMission.ts");

const baseInput = {
  sessionRuntime: {},
  sessions: [
    { id: "db-a", title: "Research task", preview: "", started_at: 1, last_response_at: 2, message_count: 1 },
    { id: "db-b", title: "Implement API", preview: "", started_at: 1, last_response_at: 2, message_count: 1 },
  ],
  missionSummaries: {},
  attentionRequests: [],
  sessionKeyByGatewayId: {
    "gw-a": "db-a",
    "gw-b": "db-b",
  },
  gatewayIdBySessionKey: {
    "db-a": "gw-a",
    "db-b": "gw-b",
  },
  activeSessionId: "gw-b",
  activeDbSessionId: "db-b",
  delegatingSessionIds: new Set(),
  subagentsBySessionId: {},
};

{
  const snapshot = buildFleetSnapshot({
    ...baseInput,
    sessionRuntime: {
      "gw-a": { running: true, blocked: false, activity: "Reading package.json…", updatedAt: 5000 },
      "gw-b": { running: true, blocked: false, activity: "Writing tests…", updatedAt: 4000 },
      "db-a": { running: true, blocked: false, activity: "Reading package.json…", updatedAt: 5000 },
    },
  });
  assert.equal(snapshot.sessions.length, 2);
  assert.equal(snapshot.runningCount, 2);
  assert.ok(snapshot.sessions.some((card) => card.sessionId === "db-a" && card.gatewayId === "gw-a"));
  assert.ok(snapshot.sessions.some((card) => card.sessionId === "db-b" && card.isActive));
}

{
  const snapshot = buildFleetSnapshot({
    ...baseInput,
    sessionRuntime: {
      "gw-a": { running: true, blocked: false, activity: "Working…", updatedAt: 3000 },
      "gw-b": { running: true, blocked: false, activity: "Working…", updatedAt: 2000 },
    },
    attentionRequests: [
      {
        id: "db-a:approval:cmd",
        sessionId: "gw-a",
        kind: "approval",
        title: "Approval needed",
        description: "Run command",
        preview: "npm test",
        createdAt: 1,
      },
    ],
  });
  const blocked = snapshot.sessions.find((card) => card.sessionId === "db-a");
  assert.equal(blocked?.status, "blocked");
  assert.equal(blocked?.attentionCount, 1);
  assert.equal(snapshot.sessions[0].sessionId, "db-a");
}

{
  const snapshot = buildFleetSnapshot({
    ...baseInput,
    sessionRuntime: {
      "gw-a": { running: false, blocked: false, activity: "Ready", updatedAt: 1000 },
    },
    missionSummaries: {
      "db-a": {
        sessionId: "db-a",
        title: "Research task",
        status: "completed",
        completedAt: Date.now() - 60_000,
        agentCount: 2,
        toolCount: 4,
        filesTouched: 3,
        summaryText: "Research complete with three findings.",
      },
    },
  });
  const completed = snapshot.sessions.find((card) => card.sessionId === "db-a");
  assert.equal(completed?.status, "completed");
  assert.match(completed?.activity ?? "", /Research complete/);
  assert.equal(snapshot.completedCount, 1);
}

{
  const snapshot = buildFleetSnapshot({
    ...baseInput,
    sessionRuntime: {
      "gw-a": { running: true, blocked: false, activity: "Delegating…", updatedAt: 7000 },
    },
    delegatingSessionIds: new Set(["gw-a"]),
    subagentsBySessionId: {
      "gw-a": [
        {
          id: "sa-1",
          goal: "Research pricing APIs",
          index: 0,
          depth: 0,
          parentId: null,
          status: "running",
          thinking: [],
          tools: [],
          notes: [],
          toolCount: 0,
          taskCount: 1,
        },
      ],
    },
  });
  const delegating = snapshot.sessions.find((card) => card.sessionId === "db-a");
  assert.equal(delegating?.isDelegating, true);
  assert.equal(delegating?.subagentCount, 1);
  assert.equal(delegating?.subagentTree.length, 1);
  assert.equal(delegating?.subagentTree[0]?.item.goal, "Research pricing APIs");
}

{
  const snapshot = buildFleetSnapshot({
    ...baseInput,
    sessionRuntime: {
      "gw-a": { running: true, blocked: false, activity: "Delegating…", updatedAt: 7000 },
    },
    subagentsBySessionId: {
      "db-a": [
        {
          id: "sa-parent",
          goal: "Coordinate rollout",
          index: 0,
          depth: 0,
          parentId: null,
          status: "running",
          thinking: [],
          tools: [],
          notes: [],
          toolCount: 0,
          taskCount: 1,
        },
        {
          id: "sa-child",
          goal: "Write migration script",
          index: 1,
          depth: 1,
          parentId: "sa-parent",
          status: "queued",
          thinking: [],
          tools: [],
          notes: [],
          toolCount: 0,
          taskCount: 1,
        },
      ],
    },
  });
  const card = snapshot.sessions.find((entry) => entry.sessionId === "db-a");
  assert.equal(card?.subagentTree.length, 1);
  assert.equal(card?.subagentTree[0]?.children.length, 1);
  assert.equal(card?.subagentTree[0]?.children[0]?.item.goal, "Write migration script");
}

{
  const snapshot = buildFleetSnapshot({
    ...baseInput,
    sessionRuntime: {
      "gw-a": { running: true, blocked: false, activity: "A", updatedAt: 1 },
      "db-a": { running: true, blocked: false, activity: "A", updatedAt: 1 },
    },
  });
  assert.equal(snapshot.sessions.filter((card) => card.sessionId === "db-a").length, 1);
}

{
  const snapshot = buildFleetSnapshot({
    ...baseInput,
    activeSessionId: "gw-a",
    activeDbSessionId: "db-a",
    sessionRuntime: {
      "db-a": { running: true, blocked: false, activity: "Stale running", updatedAt: 1000 },
      "gw-a": { running: false, blocked: false, activity: "Ready", updatedAt: 2000 },
    },
  });
  const card = snapshot.sessions.find((entry) => entry.sessionId === "db-a");
  assert.equal(card?.status, "idle");
  assert.equal(snapshot.runningCount, 0);
}

{
  const snapshot = buildFleetSnapshot({
    ...baseInput,
    sessionRuntime: {
      "gw-a": { running: true, blocked: false, activity: "A", updatedAt: 1 },
      "gw-b": { running: false, blocked: false, activity: "Ready", updatedAt: 2 },
    },
    attentionRequests: [
      {
        id: "db-b:clarify:1",
        sessionId: "db-b",
        kind: "clarify",
        title: "Clarification needed",
        description: "Which branch?",
        preview: "Which branch?",
        createdAt: 1,
      },
    ],
  });
  const options = fleetPromptTargetOptions(snapshot);
  assert.ok(options.some((option) => option.id === "gw-a"));
  assert.ok(options.some((option) => option.id === FLEET_NEW_AGENT_TARGET));
}

{
  assert.equal(
    fleetTargetGatewayId("db-a", baseInput.sessionKeyByGatewayId, baseInput.gatewayIdBySessionKey),
    "gw-a",
  );
  assert.equal(
    fleetTargetGatewayId("gw-a", baseInput.sessionKeyByGatewayId, baseInput.gatewayIdBySessionKey),
    "gw-a",
  );
}

{
  const snapshot = buildFleetSnapshot({
    ...baseInput,
    sessions: [],
    activeSessionId: null,
    activeDbSessionId: null,
    sessionRuntime: {
      "gw-orphan": { running: true, blocked: false, activity: "Mystery agent", updatedAt: 1000 },
    },
    guiTrackedSessionIds: new Set(),
  });
  assert.equal(snapshot.sessions.length, 0);
}

{
  const snapshot = buildFleetSnapshot({
    ...baseInput,
    sessions: [],
    activeSessionId: null,
    activeDbSessionId: null,
    sessionRuntime: {
      "gw-orphan": { running: true, blocked: false, activity: "Spawned agent", updatedAt: 1000 },
    },
    guiTrackedSessionIds: new Set(["gw-orphan"]),
  });
  assert.equal(snapshot.sessions.length, 1);
  assert.equal(snapshot.sessions[0]?.sessionId, "gw-orphan");
}

{
  const snapshot = buildFleetSnapshot({
    ...baseInput,
    sessions: [
      { id: "db-a", title: "Running · abc123", preview: "", started_at: 1, last_response_at: 2, message_count: 1 },
    ],
    sessionRuntime: {
      "gw-a": { running: true, blocked: false, activity: "Working…", updatedAt: 5000 },
    },
    sessionPurposeTitles: {
      "gw-a": "Refactor fleet mission cards to show purpose titles",
    },
    guiTrackedSessionIds: new Set(["gw-a", "db-a"]),
  });
  assert.equal(snapshot.sessions[0]?.label, "Refactor fleet mission cards to show purpose titles");
}

{
  const snapshot = buildFleetSnapshot({
    ...baseInput,
    sessions: [{ id: "db-b", title: "", preview: "", started_at: 1, last_response_at: 2, message_count: 1 }],
    sessionRuntime: {
      "gw-b": { running: true, blocked: false, activity: "Working…", updatedAt: 5000 },
    },
    sessionTranscriptsById: {
      "db-b": [{ id: "u1", role: "user", text: "Audit security headers in the bridge", createdAt: 1 }],
    },
    subagentsBySessionId: {
      "gw-b": [{
        id: "sub-1",
        goal: "Scan bridge security posture",
        index: 0,
        depth: 1,
        parentId: "lead",
        status: "running",
        thinking: [],
        tools: [],
        notes: [],
        toolCount: 0,
        taskCount: 0,
      }],
    },
    delegatingSessionIds: new Set(["gw-b"]),
    guiTrackedSessionIds: new Set(["gw-b", "db-b"]),
  });
  assert.equal(snapshot.sessions[0]?.label, "Scan bridge security posture");
}

{
  const snapshot = buildFleetSnapshot({
    ...baseInput,
    sessions: [
      {
        id: "session_20260525_abc",
        title: "Lets make a deep dive into the hermes react gui folder",
        preview: "",
        started_at: 1,
        last_response_at: 2,
        message_count: 3,
      },
    ],
    sessionRuntime: {
      "gw-live": { running: true, blocked: false, activity: "Running tool...", updatedAt: 6000 },
      "session_20260525_abc": { running: true, blocked: false, activity: "Running tool...", updatedAt: 6000 },
    },
    sessionKeyByGatewayId: {
      "gw-live": "session_20260525_abc",
    },
    gatewayIdBySessionKey: {
      "session_20260525_abc": "gw-live",
    },
    sessionPurposeTitles: {
      "gw-live": "Lets make a deep dive into the hermes react gui folder on my desktop",
    },
    guiTrackedSessionIds: new Set(["gw-live", "session_20260525_abc"]),
    activeSessionId: "gw-live",
    activeDbSessionId: "session_20260525_abc",
  });

  assert.equal(snapshot.sessions.length, 1);
  assert.equal(snapshot.sessions[0]?.sessionId, "session_20260525_abc");
  assert.equal(snapshot.sessions[0]?.gatewayId, "gw-live");
  assert.match(snapshot.sessions[0]?.label ?? "", /deep dive/i);
}

{
  assert.equal(
    resolveLiveGatewayForTarget(
      "session_20260525_abc",
      [{ gateway_id: "gw-live", session_key: "session_20260525_abc" }],
      { "gw-live": "session_20260525_abc" },
      { "session_20260525_abc": "gw-live" },
    ),
    "gw-live",
  );
  assert.equal(
    fleetFocusTargetId({ sessionId: "session_20260525_abc", gatewayId: "gw-live" }),
    "gw-live",
  );
}
