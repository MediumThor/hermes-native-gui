#!/usr/bin/env python3
"""Local WebSocket bridge for the standalone Hermes React Native GUI.

The bridge exposes Hermes's structured TUI JSON-RPC WebSocket transport without
running the dashboard PTY/xterm layer. It binds to localhost by default because
anything connected to this socket can drive the user's Hermes tools.
"""
from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path


def _candidate_roots() -> list[Path]:
    roots: list[Path] = []
    env_root = os.environ.get("HERMES_AGENT_ROOT")
    if env_root:
        roots.append(Path(env_root).expanduser())

    # Common git/install locations. The first existing root with tui_gateway wins.
    roots.extend(
        [
            Path.home() / ".hermes" / "hermes-agent",
            Path.cwd(),
            Path.cwd().parent,
        ]
    )

    # If the hermes CLI is on PATH, use it to discover config/home when possible.
    # Keep this bridge dependency-light; failures here are non-fatal.
    return roots


def _has_tui_gateway(root: Path) -> bool:
    return (root / "tui_gateway" / "ws.py").exists()


def _configure_import_path() -> Path | None:
    try:
        if importlib.util.find_spec("tui_gateway.ws") is not None:
            return None
    except ModuleNotFoundError:
        pass

    checked: list[str] = []
    for root in _candidate_roots():
        root = root.expanduser().resolve()
        checked.append(str(root))
        if _has_tui_gateway(root):
            sys.path.insert(0, str(root))
            return root

    raise SystemExit(
        "Could not locate Hermes Agent source/package containing tui_gateway/ws.py.\n"
        "Set HERMES_AGENT_ROOT=/path/to/hermes-agent and retry.\n"
        "Checked:\n  - " + "\n  - ".join(checked)
    )


HERMES_ROOT = _configure_import_path()

try:
    from fastapi import FastAPI, WebSocket
    from fastapi.middleware.cors import CORSMiddleware
    import uvicorn
except Exception as exc:  # pragma: no cover - user-facing startup diagnostic
    root_hint = HERMES_ROOT or Path(os.environ.get("HERMES_AGENT_ROOT", "~/.hermes/hermes-agent")).expanduser()
    raise SystemExit(
        "Missing bridge server dependencies (fastapi/uvicorn). Try running with "
        "the Hermes virtualenv Python, for example:\n"
        f"  {root_hint}/.venv/bin/python server/bridge.py\n"
        f"Original error: {exc}"
    )

try:
    from tui_gateway.ws import handle_ws
except Exception as exc:  # pragma: no cover - user-facing startup diagnostic
    raise SystemExit(
        "Failed to import Hermes tui_gateway.ws. Ensure HERMES_AGENT_ROOT points "
        f"at a valid Hermes checkout. Original error: {exc}"
    )

BRIDGE_PORT = int(os.environ.get("HERMES_NATIVE_GUI_BRIDGE_PORT", "8766"))
WEB_PORT = int(os.environ.get("HERMES_NATIVE_GUI_WEB_PORT", "8765"))
HOST = os.environ.get("HERMES_NATIVE_GUI_HOST", "127.0.0.1")

app = FastAPI(title="Hermes Native GUI Bridge")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:19006",
        "http://127.0.0.1:19006",
        f"http://localhost:{WEB_PORT}",
        f"http://127.0.0.1:{WEB_PORT}",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {
        "ok": "true",
        "hermes_root": str(HERMES_ROOT or "importable-package"),
        "host": HOST,
        "port": str(BRIDGE_PORT),
    }


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await handle_ws(ws)


if __name__ == "__main__":
    if HOST not in {"127.0.0.1", "localhost", "::1"} and os.environ.get("HERMES_NATIVE_GUI_ALLOW_REMOTE") != "1":
        raise SystemExit(
            "Refusing to bind the Hermes Native GUI bridge to a non-localhost host. "
            "Set HERMES_NATIVE_GUI_ALLOW_REMOTE=1 only if you understand the risk."
        )
    uvicorn.run(app, host=HOST, port=BRIDGE_PORT, log_level=os.environ.get("HERMES_NATIVE_GUI_LOG_LEVEL", "info"))
