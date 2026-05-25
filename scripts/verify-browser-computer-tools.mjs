#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const bridgePort = Number(process.env.HERMES_NATIVE_GUI_BRIDGE_PORT || 8766);
const bridgeHost = process.env.HERMES_NATIVE_GUI_BRIDGE_HOST || "127.0.0.1";
const tokenPath = process.env.HERMES_NATIVE_GUI_BRIDGE_TOKEN_FILE
  || path.join(homedir(), ".hermes", `hermes-native-gui-bridge-${bridgePort}.token`);
const token = (process.env.HERMES_NATIVE_GUI_BRIDGE_TOKEN || readFileSync(tokenPath, "utf8")).trim();
const wsUrl = `ws://${bridgeHost}:${bridgePort}/ws?token=${encodeURIComponent(token)}`;
const httpBase = `http://${bridgeHost}:${bridgePort}`;
const timeoutMs = Number(process.env.HERMES_NATIVE_GUI_TOOL_SMOKE_TIMEOUT_MS || 240_000);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function summarizeToolEvents(events) {
  return events
    .filter((event) => String(event.type).startsWith("tool."))
    .map((event) => ({
      type: event.type,
      name: event.payload?.name,
      context: event.payload?.context,
      preview: event.payload?.preview,
      error: event.payload?.error,
    }));
}

async function runPrompt(label, prompt, expectedTool) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const events = [];
  let sessionId = null;

  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { method, resolve, reject });
    ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
  });

  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    ws.addEventListener("message", (event) => {
      const frame = JSON.parse(event.data);
      if (frame.id && pending.has(frame.id)) {
        const pendingCall = pending.get(frame.id);
        pending.delete(frame.id);
        if (frame.error) {
          pendingCall.reject(new Error(`${pendingCall.method}: ${frame.error.message}`));
        } else {
          pendingCall.resolve(frame.result);
        }
        return;
      }

      if (frame.method !== "event") return;
      const type = frame.params?.type;
      const payload = frame.params?.payload ?? {};
      events.push({ type, payload });

      if (type === "message.complete") {
        clearTimeout(timer);
        resolve(String(payload.text ?? payload.content ?? ""));
      }
      if (type === "error") {
        clearTimeout(timer);
        reject(new Error(`${label}: ${payload.message ?? payload.error ?? "gateway error"}`));
      }
    });

    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error(`${label}: WebSocket error`));
    });
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error(`${label}: could not connect to ${wsUrl}`)), { once: true });
  });

  try {
    const created = await rpc("session.create", { cols: 100 });
    sessionId = created.session_id || created.id || created.session?.id;
    assert(sessionId, `${label}: session.create did not return a session id`);
    await rpc("prompt.submit", { session_id: sessionId, text: prompt });
    const finalText = await done;
    const toolEvents = summarizeToolEvents(events);
    assert(
      toolEvents.some((event) => event.name === expectedTool),
      `${label}: expected ${expectedTool} event, saw ${JSON.stringify(toolEvents)}`,
    );
    assert(finalText.trim(), `${label}: empty final response`);

    const snapshotResponse = await fetch(`${httpBase}/session-snapshot/${sessionId}`);
    assert(snapshotResponse.ok, `${label}: session snapshot failed (${snapshotResponse.status})`);
    const snapshot = await snapshotResponse.json();
    assert(
      Array.isArray(snapshot.messages) && snapshot.messages.some((message) => message.role === "tool" && message.name === expectedTool),
      `${label}: snapshot did not preserve ${expectedTool} tool call`,
    );

    try {
      await rpc("session.close", { session_id: sessionId });
    } catch {
      // Best-effort cleanup only; verification already succeeded.
    }

    console.log(`✓ ${label}: ${expectedTool} executed; final response: ${finalText.replace(/\s+/g, " ").trim().slice(0, 220)}`);
    return { label, sessionId, finalText, toolEvents };
  } finally {
    ws.close();
  }
}

async function main() {
  const health = await fetch(`${httpBase}/health`);
  assert(health.ok, `Bridge health check failed at ${httpBase}/health`);

  await runPrompt(
    "browser automation",
    "Hermes Native GUI smoke test: use browser automation to navigate to https://example.com and answer with the page title or heading you observed. You must actually call browser_navigate.",
    "browser_navigate",
  );

  if (process.env.HERMES_NATIVE_GUI_SKIP_COMPUTER_SMOKE === "1") {
    console.log("- computer use smoke skipped by HERMES_NATIVE_GUI_SKIP_COMPUTER_SMOKE=1");
    return;
  }

  await runPrompt(
    "computer use",
    "Hermes Native GUI smoke test: perform a safe read-only computer-use check by calling computer_use with action capture and mode ax. Do not click or type. Answer whether capture succeeded and what app/window label you observed.",
    "computer_use",
  );
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exit(1);
});
