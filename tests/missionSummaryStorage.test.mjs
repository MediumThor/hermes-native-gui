import assert from "node:assert/strict";

const {
  loadMissionSummaries,
  saveMissionSummaries,
  upsertMissionSummary,
} = globalThis.loadTsModule("./src/missionSummaryStorage.ts");

function installStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
  return store;
}

const summary = {
  sessionId: "gateway-1",
  title: "Mission",
  status: "completed",
  completedAt: 1234,
  agentCount: 2,
  toolCount: 5,
  filesTouched: 3,
  summaryText: "Done",
};

{
  const next = upsertMissionSummary({}, summary, ["db-1", null, undefined, ""]);
  assert.equal(next["gateway-1"].summaryText, "Done");
  assert.equal(next["db-1"].sessionId, "db-1");
  assert.equal(next["db-1"].summaryText, "Done");
  assert.equal(Object.keys(next).length, 2);
}

{
  installStorage();
  saveMissionSummaries({ "gateway-1": summary });
  const loaded = loadMissionSummaries();
  assert.equal(loaded["gateway-1"].status, "completed");
  assert.equal(loaded["gateway-1"].toolCount, 5);
}

{
  installStorage({ "hermes-native-gui:mission-summaries:v1": "not-json" });
  assert.deepEqual(loadMissionSummaries(), {});
}

delete globalThis.localStorage;
