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

## Configuration

Environment variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| `HERMES_AGENT_ROOT` | Path to a Hermes Agent source checkout containing `tui_gateway/ws.py` | `~/.hermes/hermes-agent` |
| `HERMES_NATIVE_GUI_PYTHON` | Python executable used for the bridge | Hermes venv Python, then `python3`, then `python` |
| `HERMES_NATIVE_GUI_WEB_PORT` | Static web UI port | `8765` |
| `HERMES_NATIVE_GUI_BRIDGE_PORT` | WebSocket bridge port | `8766` |
| `HERMES_NATIVE_GUI_HOST` | Bridge bind host | `127.0.0.1` |
| `HERMES_NATIVE_GUI_ALLOW_REMOTE` | Set to `1` to allow non-localhost bridge binding | unset |

## Security note

The bridge binds to localhost by default. Keep it that way unless you know exactly what you are doing: anyone who can connect to the bridge can drive your local Hermes agent and its tools.

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
