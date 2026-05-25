import assert from "node:assert/strict";
import Module from "node:module";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "react-native") {
    return { Platform: { OS: "web" } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { appendLocalUserTurn, mapHistoryMessages } = globalThis.loadTsModule("./src/useHermesRpc.ts");

{
  const originalNow = Date.now;
  Date.now = () => 1_000_000;
  try {
    const restored = Array.from({ length: 5 }, (_, index) => ({
      id: `m${index}`,
      role: index % 2 === 0 ? "user" : "assistant",
      content: `restored ${index}`,
    }));

    const mapped = mapHistoryMessages(restored);
    const newPrompt = { id: "new", role: "user", text: "continue", createdAt: Date.now() };

    assert.ok(
      mapped.every((message) => message.createdAt < newPrompt.createdAt),
      "restored fallback timestamps should stay before a newly submitted prompt",
    );
  } finally {
    Date.now = originalNow;
  }
}

{
  const existing = [
    { id: "u1", role: "user", text: "start", createdAt: 1 },
    { id: "a1", role: "assistant", text: "working", status: "streaming", createdAt: 2 },
  ];

  const { message, messages } = appendLocalUserTurn(existing, "please continue", {
    id: "user-fixed",
    now: 10,
  });

  assert.equal(message.id, "user-fixed");
  assert.equal(message.createdAt, 10);
  assert.equal(messages.length, 3);
  assert.equal(messages[2].text, "please continue");
  assert.equal(existing.length, 2, "appendLocalUserTurn should not mutate existing transcript");
}
