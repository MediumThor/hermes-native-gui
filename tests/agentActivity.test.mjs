import assert from "node:assert/strict";

const {
  actionFromGatewayEvent,
  describeQueuedPrompt,
  friendlyToolName,
  parseAgentActionText,
  serializeAgentAction,
} = globalThis.loadTsModule("./src/agentActivity.ts");

{
  assert.equal(friendlyToolName("read_file"), "Reading a file");
  assert.equal(friendlyToolName("search_files"), "Searching the project");
  assert.equal(friendlyToolName("browser_snapshot"), "Inspecting the page");
  assert.equal(friendlyToolName("browser_scroll"), "Scrolling the page");
  assert.equal(friendlyToolName("browser_get_images"), "Inspecting page images");
  assert.equal(friendlyToolName("computer_use"), "Using the Mac desktop");
  assert.equal(friendlyToolName("terminal"), "Running a command");
  assert.equal(friendlyToolName("delegate_task"), "Delegating work");
}

{
  const action = actionFromGatewayEvent("tool.start", {
    name: "read_file",
    context: "/Users/ryan/Desktop/hermes-native-gui/src/useHermesRpc.ts",
  });
  assert.equal(action.kind, "tool");
  assert.equal(action.title, "Reading a file");
  assert.match(action.detail, /src\/useHermesRpc\.ts/);
  assert.equal(action.status, "running");
}

{
  const action = actionFromGatewayEvent("tool.progress", {
    name: "terminal",
    preview: "npm run typecheck",
  });
  assert.equal(action.title, "Running a command");
  assert.match(action.detail, /npm run typecheck/);
}

{
  const action = actionFromGatewayEvent("status.update", {
    text: "Requesting approval for shell command",
  });
  assert.equal(action.kind, "system");
  assert.equal(action.title, "System update");
  assert.match(action.detail, /Requesting approval/);
}

{
  const approval = actionFromGatewayEvent("approval.request", {
    description: "Run npm install",
  });
  assert.equal(approval.kind, "approval");
  assert.equal(approval.title, "Waiting for approval");

  const clarify = actionFromGatewayEvent("clarify.request", {
    question: "Which account should I use?",
  });
  assert.equal(clarify.kind, "approval");
  assert.equal(clarify.title, "Waiting for your answer");
  assert.match(clarify.detail, /Which account/);

  const secret = actionFromGatewayEvent("secret.request", {
    env_var: "OPENAI_API_KEY",
  });
  assert.equal(secret.kind, "approval");
  assert.equal(secret.title, "Waiting for a secret");
  assert.match(secret.detail, /OPENAI_API_KEY/);
}

{
  const action = describeQueuedPrompt("Please keep going after this step");
  assert.equal(action.kind, "continue");
  assert.equal(action.title, "Follow-up queued");
  assert.match(action.detail, /Please keep going/);
}

{
  const encoded = serializeAgentAction({
    kind: "thinking",
    title: "Thinking through the next step",
    detail: "Checking whether the build is still running",
    status: "running",
  });
  const decoded = parseAgentActionText(encoded);
  assert.equal(decoded?.kind, "thinking");
  assert.equal(decoded?.title, "Thinking through the next step");
  assert.equal(decoded?.detail, "Checking whether the build is still running");
  assert.equal(decoded?.status, "running");
}

{
  assert.equal(parseAgentActionText("plain text"), null);
}

{
  const {
    actionFromSystemMessageText,
    activityBoundaryForAction,
    actionsFromSystemMessages,
    shouldShowWorkingOnToolsBanner,
    serializeAgentAction,
  } = globalThis.loadTsModule("./src/agentActivity.ts");

  const commandAction = serializeAgentAction({
    kind: "tool",
    title: "Running a command",
    detail: "npm test",
    status: "running",
  });
  const toolAction = serializeAgentAction({
    kind: "tool",
    title: "Reading a file",
    detail: "App.tsx",
    status: "running",
  });

  const error = actionFromSystemMessageText("Error: No response from provider for 300s", "error");
  assert.equal(error.kind, "error");
  assert.equal(activityBoundaryForAction(error), "error");

  const command = actionFromSystemMessageText("Running a command — npm run test:unit");
  assert.equal(command.kind, "tool");
  assert.equal(activityBoundaryForAction(command), "tool");

  const actions = actionsFromSystemMessages([
    { text: commandAction },
    { text: commandAction },
    { text: toolAction },
  ]);
  assert.equal(actions.length, 2);
  assert.equal(shouldShowWorkingOnToolsBanner(actions), true);
}

{
  const { cursorActivityDisplay } = globalThis.loadTsModule("./src/agentActivity.ts");

  const read = cursorActivityDisplay({
    kind: "tool",
    title: "Reading a file",
    detail: "src/fleetMission.test.mjs L1-201",
    status: "running",
  });
  assert.match(read.label, /Read fleetMission\.test\.mjs L1-201/);
  assert.equal(read.icon, "file");

  const edit = cursorActivityDisplay({
    kind: "tool",
    title: "Editing files",
    detail: "src/useHermesRpc.ts +6 -1",
    status: "complete",
  });
  assert.match(edit.label, /Edited useHermesRpc\.ts \+6 -1/);
  assert.equal(edit.icon, "edit");

  const run = cursorActivityDisplay({
    kind: "tool",
    title: "Running a command",
    detail: "npm run typecheck",
    status: "running",
  });
  assert.equal(run.label, "Ran command");
  assert.equal(run.detail, "npm run typecheck");
  assert.equal(run.icon, "terminal");

  const generic = cursorActivityDisplay({
    kind: "system",
    title: "System update",
    detail: "Waiting for the bridge to finish syncing sessions",
    status: "running",
  });
  assert.equal(generic.icon, "status");
  assert.match(generic.label, /Waiting for the bridge/);

  const nestedActivity = cursorActivityDisplay({
    kind: "system",
    title: "Activity",
    detail: "Activity — still working on the previous step",
    status: "running",
  });
  assert.equal(nestedActivity.icon, "status");
  assert.ok(nestedActivity.label.length > 0);
}

{
  const { isRenderableActivity, consolidateTurnActivities } = globalThis.loadTsModule("./src/agentActivity.ts");

  assert.equal(isRenderableActivity({ kind: "thinking", title: "Thought", detail: "hmm" }), false);
  assert.equal(isRenderableActivity({ kind: "system", title: "Activity", detail: "" }), false);
  assert.equal(
    isRenderableActivity({ kind: "tool", title: "Reading a file", detail: "Starting tool call…" }),
    false,
  );
  assert.equal(
    isRenderableActivity({ kind: "tool", title: "Reading a file", detail: "src/App.tsx" }),
    true,
  );

  const consolidated = consolidateTurnActivities([
    { kind: "tool", title: "Reading a file", detail: "App.tsx", status: "running" },
    { kind: "tool", title: "Reading a file", detail: "App.tsx", status: "running" },
    { kind: "tool", title: "Running a command", detail: "npm test", status: "running" },
    { kind: "system", title: "Activity", detail: "", status: "running" },
  ]);
  assert.equal(consolidated.length, 2);
}
