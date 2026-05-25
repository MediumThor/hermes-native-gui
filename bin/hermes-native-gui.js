#!/usr/bin/env node
/* eslint-disable no-console */
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const BRIDGE = path.join(ROOT, "server", "bridge.py");
const BRIDGE_SERVICE = "hermes-native-gui-bridge";
const DEFAULT_WEB_PORT = Number(process.env.HERMES_NATIVE_GUI_WEB_PORT || 8765);
const DEFAULT_BRIDGE_PORT = Number(process.env.HERMES_NATIVE_GUI_BRIDGE_PORT || 8766);

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
};

const args = new Set(process.argv.slice(2));
const noOpen = args.has("--no-open");
const dev = args.has("--dev");
const bridgeOnly = args.has("--bridge-only");
const help = args.has("--help") || args.has("-h");

if (help) {
  console.log(`Hermes Native GUI\n\nUsage:\n  hermes-native-gui [--no-open] [--dev] [--bridge-only]\n\nOptions:\n  --no-open      Start servers but do not open the browser\n  --dev          Use Expo dev server on port 19006 instead of static dist\n  --bridge-only  Start only the WebSocket bridge (no web UI)\n\nEnvironment:\n  HERMES_AGENT_ROOT                  Path to Hermes Agent source checkout\n  HERMES_NATIVE_GUI_WEB_PORT         Web UI port (default ${DEFAULT_WEB_PORT})\n  HERMES_NATIVE_GUI_BRIDGE_PORT      Bridge WebSocket port (default ${DEFAULT_BRIDGE_PORT})\n  HERMES_NATIVE_GUI_BRIDGE_TOKEN     Optional fixed bridge auth token\n  HERMES_NATIVE_GUI_PYTHON           Python executable for bridge\n`);
  process.exit(0);
}

if (bridgeOnly && dev) {
  console.error("Use either --dev or --bridge-only, not both.");
  process.exit(1);
}

function createBridgeToken() {
  return process.env.HERMES_NATIVE_GUI_BRIDGE_TOKEN || crypto.randomBytes(32).toString("base64url");
}

function bridgeTokenFile(port = DEFAULT_BRIDGE_PORT) {
  return path.join(os.homedir(), ".hermes", `hermes-native-gui-bridge-${port}.token`);
}

function readBridgeToken(port = DEFAULT_BRIDGE_PORT) {
  try {
    return fs.readFileSync(bridgeTokenFile(port), "utf8").trim();
  } catch {
    return null;
  }
}

async function verifyBridge(port = DEFAULT_BRIDGE_PORT) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    if (!response.ok) return false;
    const payload = await response.json();
    return payload?.service === BRIDGE_SERVICE;
  } catch {
    return false;
  }
}

async function bridgeSupportsLiveSessions(port = DEFAULT_BRIDGE_PORT) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/live-sessions`, {
      headers: { Origin: "http://localhost:19006" },
    });
    if (!response.ok) return false;
    const probe = await fetch(`http://127.0.0.1:${port}/session-snapshot/probe`, {
      headers: { Origin: "http://localhost:19006" },
    });
    return probe.status === 404 || probe.ok;
  } catch {
    return false;
  }
}

function killPort(port) {
  return new Promise((resolve) => {
    const child = spawn("lsof", ["-ti", `:${port}`], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.on("close", () => {
      const pids = out.trim().split("\n").filter(Boolean);
      for (const pid of pids) {
        try {
          process.kill(Number(pid), "SIGTERM");
        } catch {
          // Process may already be gone.
        }
      }
      setTimeout(resolve, 400);
    });
    child.on("error", () => resolve());
  });
}

function appendBridgeToken(url, token) {
  const next = new URL(url);
  next.searchParams.set("bridgeToken", token);
  return next.toString();
}

function existsExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function hermesRootCandidates() {
  const roots = [];
  if (process.env.HERMES_AGENT_ROOT) roots.push(path.resolve(process.env.HERMES_AGENT_ROOT));
  roots.push(path.join(os.homedir(), ".hermes", "hermes-agent"));
  return roots;
}

function findHermesRoot() {
  for (const root of hermesRootCandidates()) {
    if (fs.existsSync(path.join(root, "tui_gateway", "ws.py"))) return root;
  }
  return process.env.HERMES_AGENT_ROOT || path.join(os.homedir(), ".hermes", "hermes-agent");
}

function findPython(hermesRoot) {
  const candidates = [];
  if (process.env.HERMES_NATIVE_GUI_PYTHON) candidates.push(process.env.HERMES_NATIVE_GUI_PYTHON);
  candidates.push(
    path.join(hermesRoot, ".venv", "bin", "python"),
    path.join(hermesRoot, "venv", "bin", "python"),
    path.join(hermesRoot, ".venv", "Scripts", "python.exe"),
    path.join(hermesRoot, "venv", "Scripts", "python.exe"),
  );

  for (const candidate of candidates) {
    if (candidate && existsExecutable(candidate)) return candidate;
  }

  for (const name of ["python3", "python"]) {
    const probe = spawnSync(name, ["--version"], { stdio: "ignore" });
    if (!probe.error && probe.status === 0) return name;
  }

  throw new Error("Could not find Python. Set HERMES_NATIVE_GUI_PYTHON=/path/to/python.");
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ico": "image/x-icon",
    ".map": "application/json; charset=utf-8",
  }[ext] || "application/octet-stream";
}

function startStaticServer(port, bridgePort = DEFAULT_BRIDGE_PORT) {
  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    throw new Error("dist/index.html is missing. Run `npm run build:web` before `npm run serve` or use `--dev`.");
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === "/bridge-config.json") {
      const token = readBridgeToken(bridgePort);
      if (!token) {
        res.writeHead(404, SECURITY_HEADERS);
        res.end();
        return;
      }
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      res.end(JSON.stringify({ token, wsUrl: `ws://127.0.0.1:${bridgePort}/ws` }));
      return;
    }

    if (pathname === "/") pathname = "/index.html";
    const requested = path.normalize(path.join(DIST, pathname));
    const file = requested.startsWith(DIST) && fs.existsSync(requested) && fs.statSync(requested).isFile()
      ? requested
      : path.join(DIST, "index.html");
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      "Content-Type": contentType(file),
      "Cache-Control": file.endsWith("index.html") ? "no-cache" : "public, max-age=31536000",
    });
    fs.createReadStream(file).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

function isPortOpen(port, host = "127.0.0.1", timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = net.connect(port, host);
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function waitForPort(port, host = "127.0.0.1", timeoutMs = 20_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (await isPortOpen(port, host)) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) reject(new Error(`Timed out waiting for ${host}:${port}`));
      else setTimeout(tick, 250);
    };
    tick();
  });
}

function openBrowser(url) {
  const platform = process.platform;
  const command = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}

async function main() {
  const hermesRoot = findHermesRoot();
  const python = findPython(hermesRoot);
  const bridgeToken = createBridgeToken();

  const env = {
    ...process.env,
    HERMES_AGENT_ROOT: hermesRoot,
    HERMES_NATIVE_GUI_BRIDGE_PORT: String(DEFAULT_BRIDGE_PORT),
    HERMES_NATIVE_GUI_WEB_PORT: String(dev ? 19006 : DEFAULT_WEB_PORT),
    HERMES_NATIVE_GUI_BRIDGE_TOKEN: bridgeToken,
    EXPO_PUBLIC_HERMES_BRIDGE_TOKEN: bridgeToken,
  };

  console.log(`Hermes root: ${hermesRoot}`);
  console.log(`Bridge: ws://127.0.0.1:${DEFAULT_BRIDGE_PORT}/ws`);

  let bridge = null;
  let webServer = null;
  let expo = null;
  let webUrl;
  let activeBridgeToken = bridgeToken;

  const shutdown = () => {
    shuttingDown = true;
    if (webServer) webServer.close();
    if (expo) expo.kill();
    if (bridge) bridge.kill();
    setTimeout(() => process.exit(0), 200).unref();
  };

  let bridgeAlreadyRunning = await isPortOpen(DEFAULT_BRIDGE_PORT);
  if (bridgeAlreadyRunning) {
    const isOurBridge = await verifyBridge(DEFAULT_BRIDGE_PORT);
    if (!isOurBridge) {
      console.error(
        `Port ${DEFAULT_BRIDGE_PORT} is in use by another service. Stop it or set HERMES_NATIVE_GUI_BRIDGE_PORT.`,
      );
      process.exit(1);
    }

    if (!(await bridgeSupportsLiveSessions(DEFAULT_BRIDGE_PORT))) {
      console.warn(
        `Bridge on port ${DEFAULT_BRIDGE_PORT} is missing live session discovery — restarting it…`,
      );
      await killPort(DEFAULT_BRIDGE_PORT);
      bridgeAlreadyRunning = false;
    }
  }

  if (bridgeAlreadyRunning) {
    const existingToken = readBridgeToken(DEFAULT_BRIDGE_PORT);
    if (!existingToken) {
      console.error(
        `Found an existing Hermes bridge on port ${DEFAULT_BRIDGE_PORT}, but no token file at ${bridgeTokenFile(DEFAULT_BRIDGE_PORT)}.`,
      );
      console.error("Stop the old bridge and restart with this launcher.");
      process.exit(1);
    }

    activeBridgeToken = existingToken;
    console.log(`Using existing bridge on ws://127.0.0.1:${DEFAULT_BRIDGE_PORT}/ws`);
  } else {
    bridge = spawn(python, [BRIDGE], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
    bridge.stdout.on("data", (chunk) => process.stdout.write(`[bridge] ${chunk}`));
    bridge.stderr.on("data", (chunk) => process.stderr.write(`[bridge] ${chunk}`));
    bridge.on("exit", (code, signal) => {
      if (!shuttingDown) {
        console.error(`Bridge exited (${signal || code}).`);
        process.exit(code || 1);
      }
    });
  }

  await waitForPort(DEFAULT_BRIDGE_PORT).catch((error) => {
    console.error(error.message);
    if (bridge) bridge.kill();
    process.exit(1);
  });

  if (dev) {
    webUrl = "http://localhost:19006";
    const expoAlreadyRunning = await isPortOpen(19006);
    if (expoAlreadyRunning) {
      console.log(`Using existing Expo dev server at ${webUrl}`);
    } else {
      expo = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["expo", "start", "--web", "--port", "19006"], {
        cwd: ROOT,
        env,
        stdio: "inherit",
      });
      expo.on("exit", (code, signal) => {
        if (!shuttingDown) {
          console.error(`Expo exited (${signal || code}).`);
          shutdown();
          process.exit(code || 1);
        }
      });
      await waitForPort(19006).catch((error) => {
        console.error(error.message);
        shutdown();
        process.exit(1);
      });
    }
    console.log(`Dev UI: ${webUrl}`);
  } else if (bridgeOnly) {
    console.log("Bridge-only mode. Press Ctrl+C to stop.");
  } else {
    webServer = await startStaticServer(DEFAULT_WEB_PORT, DEFAULT_BRIDGE_PORT);
    webUrl = `http://127.0.0.1:${DEFAULT_WEB_PORT}`;
    console.log(`Web UI: ${webUrl}`);
  }

  if (!bridgeOnly) {
    const authedWebUrl = appendBridgeToken(webUrl, activeBridgeToken);
    if (noOpen) {
      console.log(`Open this URL in your browser:\n  ${authedWebUrl}`);
    } else {
      openBrowser(authedWebUrl);
    }
  }
  console.log("Press Ctrl+C to stop.");

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await new Promise(() => {});
}

let shuttingDown = false;
main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
