# Hermes Native GUI

A standalone React Native / Expo GUI for [Hermes Agent](https://github.com/NousResearch/hermes-agent).

This is a normal GUI chat surface: no xterm, no PTY, no terminal-grid text selection. The app talks to Hermes through the existing structured `tui_gateway` JSON-RPC WebSocket and renders messages, tool activity, approvals, clarifying questions, and secret/sudo prompts as React Native components.

## Current status

Prototype / early companion app. It is useful locally today, but the API is still expected to move while Hermes's structured GUI protocol settles.

## Requirements

- Hermes Agent installed and configured locally
- Node.js `>=20.19.0` or `>=22.12.0`
- Python environment with Hermes dashboard/TUI gateway dependencies (`fastapi`, `uvicorn`) available

On Ryan's macOS/Homebrew setup, use Node 22 explicitly:

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
```

## Quick start from this checkout

```bash
cd ~/Desktop/hermes-native-gui
npm install
npm run build:web
npm run serve
```

Then open:

```text
http://127.0.0.1:8765
```

The launcher starts:

- Web UI: `http://127.0.0.1:8765`
- Hermes bridge: `ws://127.0.0.1:8766/ws`

Use `--no-open` if you do not want the browser opened automatically:

```bash
npx hermes-native-gui --no-open
```

## Dev mode

```bash
npm run dev
```

This uses the Node launcher (`bin/hermes-native-gui.js --dev`), which:

- auto-detects Hermes root and venv Python (no manual `HERMES_AGENT_ROOT` needed in normal setups)
- reuses an existing bridge on `8766` or Expo on `19006` instead of failing on port conflicts
- starts the bridge before Expo and waits for both to be ready

Equivalent:

```bash
node bin/hermes-native-gui.js --dev
```

## Launching from Hermes

You can start this project from any shell, including Hermes Agent's `terminal` tool. There is no built-in Hermes CLI command for it yet.

### What works today

From this checkout (after `npm install`):

```bash
cd ~/Desktop/hermes-native-gui
npm run dev          # Expo dev server on http://localhost:19006
npm run serve        # static build on http://127.0.0.1:8765 (run build:web first)
```

The launcher auto-detects Hermes at `~/.hermes/hermes-agent`, starts or reuses the bridge on port `8766`, and prints a browser URL with `?bridgeToken=...`. Open that URL to connect.

From Hermes Agent chat, ask it to run the same command with **`background=true`** — this is a long-running dev server, not a one-shot shell command:

```bash
cd ~/Desktop/hermes-native-gui && npm run dev
```

Hermes will not open the browser for you; copy the printed URL (including the bridge token) into your browser.

### What is not available yet

| Approach | Status |
| --- | --- |
| `npm run dev` / `npm run serve` from a shell or Hermes terminal tool | Works from this checkout |
| `npx hermes-native-gui` | Not published to npm yet — use this repo or `node bin/hermes-native-gui.js` |
| `hermes gui` | Planned; not in Hermes CLI today |
| `hermes dashboard` / `hermes --tui` | Separate products — they use the PTY/xterm path, not this native GUI |

## Configuration

Environment variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| `HERMES_AGENT_ROOT` | Path to a Hermes Agent source checkout containing `tui_gateway/ws.py` | `~/.hermes/hermes-agent` |
| `HERMES_NATIVE_GUI_PYTHON` | Python executable used for the bridge | Hermes venv Python, then `python3`, then `python` |
| `HERMES_NATIVE_GUI_WEB_PORT` | Static web UI port | `8765` |
| `HERMES_NATIVE_GUI_BRIDGE_PORT` | WebSocket bridge port | `8766` |
| `HERMES_NATIVE_GUI_BRIDGE_TOKEN` | Optional fixed bridge auth token (auto-generated if unset) | unset |
| `HERMES_NATIVE_GUI_HOST` | Bridge bind host | `127.0.0.1` |
| `HERMES_NATIVE_GUI_ALLOW_REMOTE` | Set to `1` to allow non-localhost bridge binding | unset |

## Security note

The bridge binds to localhost by default. Keep it that way unless you know exactly what you are doing: anyone who can connect to the bridge can drive your local Hermes agent and its tools.

Security controls in this repo:

- Bridge WebSocket connections require a per-run auth token (passed to the UI by the launcher).
- Browser WebSocket handshakes must come from an allowed local UI origin (blocks cross-site WebSocket hijacking). Missing `Origin` is allowed for non-browser clients such as test scripts.
- The UI only allows loopback bridge URLs (`ws://127.0.0.1` / `ws://localhost`).
- The launcher verifies an existing bridge on port 8766 is this app (`/health.service`) and has a matching token file before reusing it.
- The static web server exposes `/bridge-config.json` (same-origin only) with the bridge token and WebSocket URL.
- The static server sends CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer`.

Token flow:

1. Launcher generates `HERMES_NATIVE_GUI_BRIDGE_TOKEN` and passes it to the bridge process.
2. Bridge writes `~/.hermes/hermes-native-gui-bridge-<port>.token` with `0600` permissions.
3. UI captures the token from the initial `?bridgeToken=` URL param (then removes it), `sessionStorage`, dev env, or `/bridge-config.json`.
4. UI appends `?token=` to the WebSocket URL when connecting.

If you start the bridge manually (`npm run bridge`), read the token from stderr or `~/.hermes/hermes-native-gui-bridge-8766.token`, then open the UI with `?bridgeToken=...` in the URL or load `/bridge-config.json` from the static server.

Remote bind:

- Setting `HERMES_NATIVE_GUI_ALLOW_REMOTE=1` allows non-loopback binding, but also requires an explicit `HERMES_NATIVE_GUI_BRIDGE_TOKEN`.
- Raw `ws://` over a LAN is not safe. Use TLS (`wss://`) or a secure tunnel if you truly need remote access.

Verify the security baseline:

```bash
npm run serve
npm run verify:security
```

Verify that Hermes tool execution still works through the native GUI bridge (this creates temporary Hermes sessions and uses your configured model):

```bash
# in one terminal
HERMES_NATIVE_GUI_WEB_PORT=8875 HERMES_NATIVE_GUI_BRIDGE_PORT=8876 npm run serve

# in another terminal
HERMES_NATIVE_GUI_BRIDGE_PORT=8876 npm run verify:tools
```

The tool smoke test requires the `browser` and `computer_use` toolsets to be enabled. Set `HERMES_NATIVE_GUI_SKIP_COMPUTER_SMOKE=1` if you only want to verify browser automation.

## Fleet Mission Control

When multiple Hermes sessions are running in parallel, open **Fleet Mission Control** from the main menu to:

- see all running, blocked, and recently completed sessions in one dashboard
- send a prompt to a specific session via the target selector
- spawn a **New agent** (`session.create` + `prompt.submit`) without switching away from the fleet view
- stop individual sessions, respond to blocked approvals/clarifications, and review mission summaries

Entry points:

- Main menu → **Fleet Mission Control**
- Chat banner when more than one session is running

Session-scoped **Mission Control** (subagent delegation inside one chat) remains separate and opens automatically during delegation within the active chat.

Direct prompt-to-subagent is intentionally not supported in the GUI until Hermes exposes a first-class gateway API for it.

## Architecture

```text
React Native / Expo GUI
        │
        │ JSON-RPC over WebSocket
        ▼
server/bridge.py
        │
        │ imports Hermes tui_gateway.ws.handle_ws
        ▼
Hermes Agent session + tools
```

This intentionally avoids the dashboard's PTY/xterm path:

```text
browser → xterm → PTY → hermes --tui
```

## Main files

```text
App.tsx                    Main React Native shell
src/useHermesRpc.ts        JSON-RPC client and event reducer
src/components/            Approval / clarify / secure-input overlays
server/bridge.py           FastAPI WebSocket bridge into Hermes tui_gateway
bin/hermes-native-gui.js   Node launcher and static file server
```

## Publishing target

The intended public UX is:

```bash
npx hermes-native-gui
```

Eventually this can become an official Hermes command:

```bash
hermes gui
```

## Troubleshooting

### Vite/Expo or Metro fails because of Node version

Check:

```bash
node -v
```

Use Node 20.19+ or 22.12+.

### Bridge cannot find Hermes

Set:

```bash
export HERMES_AGENT_ROOT="$HOME/.hermes/hermes-agent"
```

### Missing `fastapi` or `uvicorn`

Run the launcher with Hermes's venv Python:

```bash
export HERMES_NATIVE_GUI_PYTHON="$HOME/.hermes/hermes-agent/.venv/bin/python"
npm run serve
```

### Browser connects but Hermes session creation fails

Check Hermes itself first:

```bash
hermes doctor
hermes chat -q "say hi"
```
