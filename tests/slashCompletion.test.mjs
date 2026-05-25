import assert from "node:assert/strict";

const { applySlashCompletionToDraft } = globalThis.loadTsModule("src/slashCompletion.ts");

assert.equal(
  applySlashCompletionToDraft("/he", { text: "help" }, 1),
  "/help ",
);

assert.equal(
  applySlashCompletionToDraft("/details t", { text: "tools" }, 9),
  "/details tools ",
);
