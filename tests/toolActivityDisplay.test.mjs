import assert from "node:assert/strict";

const {
  toolActivityDisplay,
} = globalThis.loadTsModule("./src/toolActivityDisplay.ts");

{
  const display = toolActivityDisplay({
    id: "1",
    name: "read_file",
    status: "running",
    preview: "/Users/ryan/Desktop/hermes-native-gui/src/App.tsx",
    startedAt: 10,
  });
  assert.equal(display.title, "Reading a file");
  assert.equal(display.statusText, "Running");
  assert.match(display.preview, /src\/App\.tsx/);
}

{
  const display = toolActivityDisplay({
    id: "2",
    name: "terminal",
    status: "complete",
    preview: "npm run build:web",
    startedAt: 10,
    completedAt: 1510,
  });
  assert.equal(display.title, "Running a command");
  assert.equal(display.statusText, "Done · 1.5s");
}

{
  const display = toolActivityDisplay({
    id: "3",
    name: "terminal",
    status: "error",
    error: "Command failed",
  });
  assert.equal(display.statusText, "Needs attention");
}
