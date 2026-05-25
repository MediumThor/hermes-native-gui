#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Bridge and static-server security checks for Hermes Native GUI.
 *
 * Usage (with `npm run serve` already running):
 *   node scripts/verify-bridge-security.mjs
 */
import crypto from "crypto";
import fs from "fs";
import net from "net";
import os from "os";
import path from "path";

const WEB_PORT = Number(process.env.HERMES_NATIVE_GUI_WEB_PORT || 8765);
const BRIDGE_PORT = Number(process.env.HERMES_NATIVE_GUI_BRIDGE_PORT || 8766);
const WEB_ORIGIN = `http://127.0.0.1:${WEB_PORT}`;
const BRIDGE_WS = `ws://127.0.0.1:${BRIDGE_PORT}/ws`;
const ALLOWED_BRIDGE_ORIGINS = [
  WEB_ORIGIN,
  `http://localhost:${WEB_PORT}`,
  "http://localhost:19006",
  "http://127.0.0.1:19006",
];

const REQUIRED_STATIC_HEADERS = [
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
];

function tokenFilePath(port = BRIDGE_PORT) {
  return path.join(os.homedir(), ".hermes", `hermes-native-gui-bridge-${port}.token`);
}

function readBridgeToken() {
  try {
    return fs.readFileSync(tokenFilePath(), "utf8").trim();
  } catch {
    return null;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchStatus(url, init) {
  const response = await fetch(url, init);
  return { response, headers: response.headers, status: response.status };
}

async function expectHttp(url, expectedStatus, init) {
  const { status } = await fetchStatus(url, init);
  assert(status === expectedStatus, `${url} expected HTTP ${expectedStatus}, got ${status}`);
}

function wsHandshake(port, token, origin) {
  return new Promise((resolve) => {
    const key = crypto.randomBytes(16).toString("base64");
    const lines = [
      `GET /ws?token=${encodeURIComponent(token)} HTTP/1.1`,
      `Host: 127.0.0.1:${port}`,
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Key: ${key}`,
      "Sec-WebSocket-Version: 13",
    ];
    if (origin) lines.push(`Origin: ${origin}`);
    lines.push("", "");
    const request = lines.join("\r\n");

    const socket = net.connect(port, "127.0.0.1");
    let data = "";
    const finish = (ok, reason = "") => {
      socket.destroy();
      resolve({ ok, reason, data });
    };

    socket.setTimeout(4000);
    socket.on("connect", () => socket.write(request));
    socket.on("data", (chunk) => {
      data += chunk.toString();
      if (data.includes("\r\n\r\n")) {
        finish(data.startsWith("HTTP/1.1 101"), data.split("\r\n")[0]);
      }
    });
    socket.on("timeout", () => finish(false, "timeout"));
    socket.on("error", (error) => finish(false, error.message));
    socket.on("close", () => {
      if (!data) finish(false, "closed");
      else if (!data.startsWith("HTTP/1.1 101")) finish(false, data.split("\r\n")[0] || "rejected");
    });
  });
}

function wsConnect(url) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.close();
      resolve({ ok: false, reason: "timeout" });
    }, 4000);

    ws.addEventListener("open", () => {
      clearTimeout(timer);
      ws.close();
      resolve({ ok: true });
    });

    ws.addEventListener("error", () => {
      clearTimeout(timer);
      resolve({ ok: false, reason: "error" });
    });

    ws.addEventListener("close", (event) => {
      clearTimeout(timer);
      if (event.wasClean && event.code === 1000) return;
      resolve({ ok: false, reason: event.reason || `close:${event.code}` });
    });
  });
}

async function resolveBridgeOrigin(token) {
  for (const origin of ALLOWED_BRIDGE_ORIGINS) {
    const probe = await fetchStatus(`http://127.0.0.1:${BRIDGE_PORT}/bridge-config`, {
      headers: { Origin: origin },
    });
    if (probe.status === 200) {
      const payload = await probe.response.json();
      if (payload.token === token) return origin;
    }
  }
  throw new Error("Could not find an allowed Origin for the running bridge. Restart `npm run serve`.");
}

async function checkBridgeConfigOrigin(token) {
  const bad = await fetchStatus(`http://127.0.0.1:${BRIDGE_PORT}/bridge-config`, {
    headers: { Origin: "https://evil.example" },
  });
  assert(bad.status === 403, `/bridge-config with bad Origin expected 403, got ${bad.status}`);

  const allowedOrigin = await resolveBridgeOrigin(token);
  assert(allowedOrigin, "bridge /bridge-config allowed origin probe failed");
}

async function checkWebSockets(token) {
  const allowedOrigin = await resolveBridgeOrigin(token);

  const missing = await wsConnect(BRIDGE_WS);
  assert(!missing.ok, "WebSocket without token should fail");

  const wrong = await wsConnect(`${BRIDGE_WS}?token=wrong-token`);
  assert(!wrong.ok, "WebSocket with wrong token should fail");

  const badOrigin = await wsHandshake(BRIDGE_PORT, token, "https://evil.example");
  assert(!badOrigin.ok, `WebSocket with bad Origin should fail (${badOrigin.reason || badOrigin.data})`);

  const goodOrigin = await wsHandshake(BRIDGE_PORT, token, allowedOrigin);
  assert(goodOrigin.ok, `WebSocket with allowed Origin and correct token should connect (${goodOrigin.reason || goodOrigin.data})`);
}

async function checkStaticHeaders() {
  const { headers, status } = await fetchStatus(`${WEB_ORIGIN}/`);
  assert(status === 200, `Static server / returned ${status}`);
  for (const name of REQUIRED_STATIC_HEADERS) {
    assert(headers.get(name), `Missing static header: ${name}`);
  }
  assert(headers.get("x-frame-options")?.toUpperCase() === "DENY", "X-Frame-Options must be DENY");
}

async function checkBridgeConfigJson(token) {
  const { response, status } = await fetchStatus(`${WEB_ORIGIN}/bridge-config.json`);
  assert(status === 200, `/bridge-config.json returned ${status}`);
  const payload = await response.json();
  assert(payload.token === token, "bridge-config.json token mismatch");
  assert(String(payload.wsUrl).includes(String(BRIDGE_PORT)), "bridge-config.json wsUrl mismatch");
}

async function checkHealth() {
  const { response, status } = await fetchStatus(`http://127.0.0.1:${BRIDGE_PORT}/health`);
  assert(status === 200, `/health returned ${status}`);
  const payload = await response.json();
  assert(payload.service === "hermes-native-gui-bridge", "Unexpected /health service name");
  assert(!("hermes_root" in payload), "/health must not expose hermes_root");
  assert(!("port" in payload), "/health must not expose port details");
}

async function checkDocsDisabled() {
  await expectHttp(`http://127.0.0.1:${BRIDGE_PORT}/docs`, 404);
  await expectHttp(`http://127.0.0.1:${BRIDGE_PORT}/redoc`, 404);
  await expectHttp(`http://127.0.0.1:${BRIDGE_PORT}/openapi.json`, 404);
}

async function main() {
  const token = readBridgeToken();
  assert(token, `Missing bridge token file at ${tokenFilePath()}. Start the launcher first.`);

  const checks = [
    ["static security headers", () => checkStaticHeaders()],
    ["/bridge-config.json", () => checkBridgeConfigJson(token)],
    ["bridge /bridge-config origin", () => checkBridgeConfigOrigin(token)],
    ["/health minimization", () => checkHealth()],
    ["FastAPI docs disabled", () => checkDocsDisabled()],
    ["WebSocket auth/origin", () => checkWebSockets(token)],
  ];

  let passed = 0;
  for (const [label, run] of checks) {
    process.stdout.write(`• ${label}… `);
    await run();
    passed += 1;
    console.log("ok");
  }

  console.log(`\n${passed}/${checks.length} bridge security checks passed.`);
}

main().catch((error) => {
  console.error(`\nSecurity verification failed: ${error.message}`);
  process.exit(1);
});
