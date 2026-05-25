#!/usr/bin/env python3
"""Local WebSocket bridge for the standalone Hermes React Native GUI.

The bridge exposes Hermes's structured TUI JSON-RPC WebSocket transport without
running the dashboard PTY/xterm layer. It binds to localhost by default because
anything connected to this socket can drive the user's Hermes tools.
"""
from __future__ import annotations

import importlib.util
import os
import secrets
import sys
from pathlib import Path

SERVICE_NAME = "hermes-native-gui-bridge"


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
    from fastapi import FastAPI, HTTPException, Request, WebSocket
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
    from tui_gateway import server as tui_server
except Exception as exc:  # pragma: no cover - user-facing startup diagnostic
    raise SystemExit(
        "Failed to import Hermes tui_gateway.ws. Ensure HERMES_AGENT_ROOT points "
        f"at a valid Hermes checkout. Original error: {exc}"
    )


def _install_native_gui_methods() -> None:
    """Small GUI-only RPC helpers layered on top of Hermes' gateway methods."""
    methods = getattr(tui_server, "_methods", {})

    if "image.clear" not in methods:

        @tui_server.method("image.clear")
        def _(rid, params: dict) -> dict:
            session, err = tui_server._sess(params, rid)
            if err:
                return err
            count = len(session.get("attached_images") or [])
            session["attached_images"] = []
            return tui_server._ok(rid, {"cleared": count})

    if "skills.listInstalled" not in methods:

        @tui_server.method("skills.listInstalled")
        def _(rid, params: dict) -> dict:
            try:
                from hermes_cli.config import load_config
                from hermes_cli.skills_config import get_disabled_skills
                from tools.skills_tool import _find_all_skills

                config = load_config()
                disabled = get_disabled_skills(config)
                skills = _find_all_skills(skip_disabled=True)
                for skill in skills:
                    skill["enabled"] = skill["name"] not in disabled
                return tui_server._ok(rid, {"skills": skills})
            except Exception as exc:
                return tui_server._err(rid, 5026, str(exc))

        @tui_server.method("skills.toggle")
        def _(rid, params: dict) -> dict:
            name = str(params.get("name", "") or "").strip()
            if not name:
                return tui_server._err(rid, 4018, "name required")
            if "enabled" not in params:
                return tui_server._err(rid, 4002, "enabled required")
            try:
                from hermes_cli.config import load_config
                from hermes_cli.skills_config import get_disabled_skills, save_disabled_skills

                enabled = bool(params.get("enabled"))
                config = load_config()
                disabled = get_disabled_skills(config)
                if enabled:
                    disabled.discard(name)
                else:
                    disabled.add(name)
                save_disabled_skills(config, disabled)
                return tui_server._ok(rid, {"name": name, "enabled": enabled})
            except Exception as exc:
                return tui_server._err(rid, 5027, str(exc))

    if "plugins.listDetailed" not in methods:

        @tui_server.method("plugins.listDetailed")
        def _(rid, params: dict) -> dict:
            try:
                from hermes_cli.plugins import get_plugin_manager

                mgr = get_plugin_manager()
                if params.get("force"):
                    mgr.discover_and_load(force=True)
                return tui_server._ok(rid, {"plugins": mgr.list_plugins()})
            except Exception as exc:
                return tui_server._err(rid, 5028, str(exc))

        @tui_server.method("plugins.toggle")
        def _(rid, params: dict) -> dict:
            name = str(params.get("name", "") or "").strip()
            if not name:
                return tui_server._err(rid, 4018, "name required")
            if "enabled" not in params:
                return tui_server._err(rid, 4002, "enabled required")
            try:
                from hermes_cli.plugins_cmd import dashboard_set_agent_plugin_enabled

                result = dashboard_set_agent_plugin_enabled(
                    name,
                    enabled=bool(params.get("enabled")),
                )
                if not result.get("ok"):
                    return tui_server._err(
                        rid,
                        5029,
                        str(result.get("error") or "plugin toggle failed"),
                    )
                return tui_server._ok(rid, result)
            except Exception as exc:
                return tui_server._err(rid, 5029, str(exc))


def _install_transport_rebind_patch() -> None:
    """Re-bind live session transports when the browser reconnects.

    Hermes routes async agent events to the transport stored on each gateway
    session. When a WebSocket closes, ws.py detaches and falls back to stdio —
    which is why events can appear in bridge logs but never reach the UI.
    Any RPC that names a session_id should reclaim that session for the caller.
    """
    original_dispatch = tui_server.dispatch

    def dispatch(req: dict, transport=None):
        params = req.get("params") or {}
        sid = params.get("session_id") or ""
        if sid and transport is not None:
            session = tui_server._sessions.get(sid)
            if session is not None:
                session["transport"] = transport
        return original_dispatch(req, transport)

    tui_server.dispatch = dispatch


_install_transport_rebind_patch()
_install_native_gui_methods()

BRIDGE_PORT = int(os.environ.get("HERMES_NATIVE_GUI_BRIDGE_PORT", "8766"))
WEB_PORT = int(os.environ.get("HERMES_NATIVE_GUI_WEB_PORT", "8765"))
HOST = os.environ.get("HERMES_NATIVE_GUI_HOST", "127.0.0.1")
LOCAL_BIND_HOSTS = {"127.0.0.1", "localhost", "::1"}
REMOTE_BIND_ALLOWED = os.environ.get("HERMES_NATIVE_GUI_ALLOW_REMOTE") == "1"
EXPLICIT_BRIDGE_TOKEN = os.environ.get("HERMES_NATIVE_GUI_BRIDGE_TOKEN")
BRIDGE_TOKEN = EXPLICIT_BRIDGE_TOKEN or secrets.token_urlsafe(32)

ALLOWED_ORIGINS = {
    "http://localhost:19006",
    "http://127.0.0.1:19006",
    f"http://localhost:{WEB_PORT}",
    f"http://127.0.0.1:{WEB_PORT}",
}


def _token_file_path() -> Path:
    return Path.home() / ".hermes" / f"hermes-native-gui-bridge-{BRIDGE_PORT}.token"


def _persist_bridge_token(token: str) -> None:
    token_dir = _token_file_path().parent
    token_dir.mkdir(parents=True, exist_ok=True)
    token_path = _token_file_path()
    token_path.write_text(token, encoding="utf-8")
    token_path.chmod(0o600)


def _origin_allowed(origin: str | None) -> bool:
    # Browsers send Origin on cross-origin WebSocket handshakes; block CSWSH.
    # Missing Origin is allowed for non-browser clients (CLI probes, test scripts).
    if origin is None:
        return True
    return origin in ALLOWED_ORIGINS


def _token_valid(token: str | None) -> bool:
    return secrets.compare_digest(token or "", BRIDGE_TOKEN)


_persist_bridge_token(BRIDGE_TOKEN)
print(f"HERMES_NATIVE_GUI_BRIDGE_TOKEN={BRIDGE_TOKEN}", file=sys.stderr, flush=True)

app = FastAPI(
    title="Hermes Native GUI Bridge",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(ALLOWED_ORIGINS),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"ok": "true", "service": SERVICE_NAME}


@app.get("/bridge-config")
async def bridge_config(request: Request) -> dict[str, str]:
    origin = request.headers.get("origin")
    if origin is not None and origin not in ALLOWED_ORIGINS:
        raise HTTPException(status_code=403, detail="Origin not allowed")

    return {
        "token": BRIDGE_TOKEN,
        "wsUrl": f"ws://127.0.0.1:{BRIDGE_PORT}/ws",
    }


def _session_activity(session: dict) -> str:
    tool_started_at = session.get("tool_started_at") or {}
    if not tool_started_at:
        return "Working…" if session.get("running") else ""

    tool_names: dict[str, str] = {}
    for message in session.get("history") or []:
        if not isinstance(message, dict) or message.get("role") != "assistant":
            continue
        for tool_call in message.get("tool_calls") or []:
            tool_call_id = tool_call.get("id")
            function = tool_call.get("function") or {}
            if tool_call_id and function.get("name"):
                tool_names[str(tool_call_id)] = str(function["name"])

    active_names = [
        tool_names.get(str(tool_call_id)) or "tool" for tool_call_id in tool_started_at
    ]
    if not active_names:
        return "Working…"
    if len(active_names) == 1:
        return f"Running {active_names[0]}…"
    return f"Running {active_names[0]} (+{len(active_names) - 1} more)…"


def _session_snapshot_payload(gateway_id: str, session: dict) -> dict[str, object]:
    from tui_gateway import server as tui_server

    history = list(session.get("history") or [])
    messages = tui_server._history_to_messages(history)
    tool_started_at = session.get("tool_started_at") or {}
    tool_names: dict[str, str] = {}
    for message in history:
        if not isinstance(message, dict) or message.get("role") != "assistant":
            continue
        for tool_call in message.get("tool_calls") or []:
            tool_call_id = tool_call.get("id")
            function = tool_call.get("function") or {}
            if tool_call_id and function.get("name"):
                tool_names[str(tool_call_id)] = str(function["name"])

    active_tools: list[dict[str, object]] = []
    for tool_call_id in tool_started_at:
        name = tool_names.get(str(tool_call_id)) or "tool"
        active_tools.append({"tool_id": str(tool_call_id), "name": name})

    running = bool(session.get("running"))
    activity = _session_activity(session) if running else ""
    return {
        "gateway_id": gateway_id,
        "session_key": str(session.get("session_key") or ""),
        "running": running,
        "activity": activity,
        "messages": messages,
        "active_tools": active_tools,
    }


@app.get("/live-sessions")
async def live_sessions(request: Request) -> dict[str, list[dict[str, object]]]:
    """List gateway sessions still alive in the Hermes process (survives UI refresh)."""
    origin = request.headers.get("origin")
    if origin is not None and origin not in ALLOWED_ORIGINS:
        raise HTTPException(status_code=403, detail="Origin not allowed")

    try:
        from tui_gateway import server as tui_server
    except Exception as exc:  # pragma: no cover - startup/import edge case
        raise HTTPException(status_code=503, detail=f"Hermes gateway unavailable: {exc}") from exc

    try:
        snapshot = list(tui_server._sessions.items())
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not enumerate live sessions: {exc}") from exc

    rows: list[dict[str, object]] = []
    for gateway_id, session in snapshot:
        running = bool(session.get("running"))
        rows.append(
            {
                "gateway_id": str(gateway_id),
                "session_key": str(session.get("session_key") or ""),
                "running": running,
                "activity": _session_activity(session) if running else "",
            }
        )
    return {"sessions": rows}


@app.get("/session-snapshot/{gateway_id}")
async def session_snapshot(gateway_id: str, request: Request) -> dict[str, object]:
    """Return in-memory transcript + active tool state for a live gateway session."""
    origin = request.headers.get("origin")
    if origin is not None and origin not in ALLOWED_ORIGINS:
        raise HTTPException(status_code=403, detail="Origin not allowed")

    try:
        from tui_gateway import server as tui_server
    except Exception as exc:  # pragma: no cover - startup/import edge case
        raise HTTPException(status_code=503, detail=f"Hermes gateway unavailable: {exc}") from exc

    session = tui_server._sessions.get(gateway_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session not found")
    return _session_snapshot_payload(gateway_id, session)


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    origin = ws.headers.get("origin")
    if not _origin_allowed(origin):
        await ws.close(code=1008, reason="Origin not allowed")
        return

    if not _token_valid(ws.query_params.get("token")):
        await ws.close(code=1008, reason="Invalid bridge token")
        return

    await handle_ws(ws)


if __name__ == "__main__":
    if HOST not in LOCAL_BIND_HOSTS and not REMOTE_BIND_ALLOWED:
        raise SystemExit(
            "Refusing to bind the Hermes Native GUI bridge to a non-localhost host. "
            "Set HERMES_NATIVE_GUI_ALLOW_REMOTE=1 only if you understand the risk."
        )
    if HOST not in LOCAL_BIND_HOSTS and REMOTE_BIND_ALLOWED and not EXPLICIT_BRIDGE_TOKEN:
        raise SystemExit(
            "Remote bridge bind requires an explicit HERMES_NATIVE_GUI_BRIDGE_TOKEN. "
            "Raw ws:// over a LAN is not safe without TLS or a secure tunnel."
        )
    uvicorn.run(app, host=HOST, port=BRIDGE_PORT, log_level=os.environ.get("HERMES_NATIVE_GUI_LOG_LEVEL", "info"))
