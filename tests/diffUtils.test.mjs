import assert from "node:assert/strict";

const {
  computeDiffStats,
  extractInlineDiff,
  extractPathFromDiff,
  fileExtensionBadge,
  formatDiffStats,
  isEditToolName,
  isUnifiedDiff,
  splitUnifiedDiff,
} = globalThis.loadTsModule("./src/diffUtils.ts");

{
  const diff = [
    "--- a/src/agentActivity.ts",
    "+++ b/src/agentActivity.ts",
    "@@ -1,3 +1,4 @@",
    " context",
    "-old line",
    "+new line",
    "+added line",
  ].join("\n");

  assert.equal(extractPathFromDiff(diff), "src/agentActivity.ts");
  assert.deepEqual(computeDiffStats(diff), { added: 2, removed: 1 });
  assert.equal(formatDiffStats(computeDiffStats(diff)), "+2 -1");
  assert.equal(fileExtensionBadge("agentActivity.ts"), "TS");
  assert.equal(isUnifiedDiff(diff), true);
}

{
  assert.equal(extractInlineDiff({ inline_diff: "@@\n+1" }), "@@\n+1");
  assert.equal(extractInlineDiff({ inlineDiff: "patch" }), "patch");
  assert.equal(extractInlineDiff({}), undefined);
}

{
  assert.equal(isEditToolName("patch"), true);
  assert.equal(isEditToolName("read_file"), false);
}

{
  const multi = [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1 +1 @@",
    "-a",
    "+b",
    "diff --git a/src/b.ts b/src/b.ts",
    "--- a/src/b.ts",
    "+++ b/src/b.ts",
    "@@ -1 +1 @@",
    "-c",
    "+d",
  ].join("\n");

  const chunks = splitUnifiedDiff(multi);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].path, "a.ts");
  assert.equal(chunks[1].path, "b.ts");
}

{
  const { actionFromGatewayEvent, parseAgentActionText, serializeAgentAction } =
    globalThis.loadTsModule("./src/agentActivity.ts");

  const diff = [
    "--- a/src/useHermesRpc.ts",
    "+++ b/src/useHermesRpc.ts",
    "@@ -1 +1 @@",
    "-old",
    "+new",
  ].join("\n");

  const action = actionFromGatewayEvent("tool.complete", {
    name: "patch",
    context: "src/useHermesRpc.ts",
    inline_diff: diff,
  });

  assert.equal(action?.kind, "tool");
  assert.equal(action?.status, "complete");
  assert.match(action?.detail ?? "", /useHermesRpc\.ts \+1 -1/);
  assert.equal(action?.inlineDiff, diff);

  const encoded = serializeAgentAction(action);
  const decoded = parseAgentActionText(encoded);
  assert.equal(decoded?.inlineDiff, diff);
}
