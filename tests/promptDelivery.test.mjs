import assert from "node:assert/strict";

const {
  resolveBusyEmptyEnter,
  isPlainEnterKey,
  isComposerBusy,
  DOUBLE_ENTER_MS,
} = globalThis.loadTsModule("src/promptDelivery.ts");

assert.equal(DOUBLE_ENTER_MS, 600);

{
  const first = resolveBusyEmptyEnter(0, 1_000);
  assert.equal(first.action, "interrupt_armed");
  assert.equal(first.nextLastEmptyEnterAt, 1_000);

  const second = resolveBusyEmptyEnter(first.nextLastEmptyEnterAt, 1_200);
  assert.equal(second.action, "interrupt");
}

{
  const first = resolveBusyEmptyEnter(0, 1_000);
  const tooLate = resolveBusyEmptyEnter(first.nextLastEmptyEnterAt, 1_000 + DOUBLE_ENTER_MS);
  assert.equal(tooLate.action, "interrupt_armed");
}

assert.equal(isPlainEnterKey({ nativeEvent: { key: "Enter" } }), true);
assert.equal(isPlainEnterKey({ nativeEvent: { key: "\n" } }), true);
assert.equal(isPlainEnterKey({ key: "Enter" }), true);
assert.equal(isPlainEnterKey({ nativeEvent: { key: "Enter", shiftKey: true } }), false);
assert.equal(isPlainEnterKey({ nativeEvent: { key: "a" } }), false);

assert.equal(isComposerBusy(false, undefined), false);
assert.equal(isComposerBusy(true, undefined), true);
assert.equal(isComposerBusy(false, { running: true, blocked: false }), true);
assert.equal(isComposerBusy(false, { running: false, blocked: true }), true);
