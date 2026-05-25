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
import time
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

    def _terminal_run_block_reason(command: str) -> str | None:
        """Return a short reason when a GUI terminal command is too dangerous."""
        import re
        import shlex

        lowered = command.lower()
        compact = re.sub(r"\s+", "", lowered)
        home = str(Path.home())
        home_var = "$" + "{HOME}"

        if re.search(r"(^|[;&|()\s])sudo(\s|$)", lowered):
            return "sudo is blocked"
        if ":(){:|:&};:" in compact or re.search(r":\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:", lowered):
            return "fork bombs are blocked"
        if re.search(r"(^|[;&|()\s])mkfs(?:\.[\w.-]+)?(\s|$)", lowered):
            return "mkfs is blocked"
        if re.search(r"(^|[;&|()\s])(shutdown|reboot|halt)(\s|$)", lowered):
            return "shutdown/reboot/halt is blocked"
        if re.search(r"(^|[;&|]\s*)diskutil\s+[^\n;&|]*(erase|partition|secureerase|delete)", lowered):
            return "destructive diskutil operations are blocked"
        if re.search(r"\bdd\b[^\n;&|]*\bof=/dev/", lowered):
            return "dd writes to /dev are blocked"
        if re.search(r"(?:^|[\s;&|])(?:>|>>)\s*/dev/(?:r?disk)", lowered):
            return "raw writes to /dev/disk are blocked"
        if re.search(r"\b(curl|wget)\b[\s\S]{0,400}\|\s*(?:sudo\s+)?(?:/usr/bin/env\s+)?(?:sh|bash|zsh|ksh|fish)\b", lowered):
            return "curl/wget piped to a shell is blocked"

        obvious_rm = [
            r"\brm\b[^\n;&|]*(?:\s|^)/(?:\s|$|[;&|*])",
            r"\brm\b[^\n;&|]*(?:\s|^)(?:~|\$HOME|\$\{HOME\})(?:/|\s|$|[;&|])",
        ]
        if home:
            obvious_rm.append(r"\brm\b[^\n;&|]*(?:\s|^)" + re.escape(home) + r"(?:/|\s|$|[;&|])")
        if any(re.search(pattern, command) for pattern in obvious_rm):
            return "destructive rm against /, ~, or $HOME is blocked"

        try:
            tokens = shlex.split(command, posix=True)
        except ValueError:
            tokens = command.split()
        separators = {";", "&&", "||", "|"}
        dangerous_targets = {"/", "~", "$HOME", home_var, home}
        for index, token in enumerate(tokens):
            if Path(token).name != "rm":
                continue
            for target in tokens[index + 1 :]:
                if target in separators:
                    break
                if target.startswith("-"):
                    continue
                normalized = target.rstrip("/") or target
                if target in dangerous_targets or normalized in dangerous_targets:
                    return "destructive rm against /, ~, or $HOME is blocked"
                if target.startswith(("~/", "$HOME/", home_var + "/")):
                    return "destructive rm against /, ~, or $HOME is blocked"
                if home and (target == home or target.startswith(f"{home}/")):
                    return "destructive rm against /, ~, or $HOME is blocked"
                if target.startswith(("/*", "/.")):
                    return "destructive rm against / is blocked"
        return None

    if "terminal.run" not in methods:

        @tui_server.method("terminal.run")
        def _(rid, params: dict) -> dict:
            import subprocess

            if not isinstance(params, dict):
                params = {}
            command = str(params.get("command") or "").strip()
            if not command:
                return tui_server._err(rid, 4004, "command required")

            blocked_reason = _terminal_run_block_reason(command)
            if blocked_reason:
                return tui_server._err(rid, 4005, f"blocked command: {blocked_reason}")

            cwd_value = params.get("cwd")
            try:
                cwd_path = Path(str(cwd_value)).expanduser().resolve() if cwd_value else Path.cwd().resolve()
            except Exception as exc:
                return tui_server._err(rid, 4006, f"invalid cwd: {exc}")
            if not cwd_path.exists() or not cwd_path.is_dir():
                return tui_server._err(rid, 4006, f"invalid cwd: {cwd_path}")

            try:
                timeout_seconds = float(params.get("timeout", 60) or 60)
            except (TypeError, ValueError):
                return tui_server._err(rid, 4007, "invalid timeout")
            if timeout_seconds <= 0:
                return tui_server._err(rid, 4007, "invalid timeout")
            timeout_seconds = min(timeout_seconds, 120.0)

            started = time.monotonic()
            timed_out = False
            exit_code: int | None = None
            output = ""
            try:
                completed = subprocess.run(
                    command,
                    shell=True,
                    executable=os.environ.get("SHELL") or "/bin/zsh",
                    cwd=str(cwd_path),
                    env=os.environ.copy(),
                    capture_output=True,
                    text=True,
                    timeout=timeout_seconds,
                )
                exit_code = completed.returncode
                output = (completed.stdout or "") + (completed.stderr or "")
            except subprocess.TimeoutExpired as exc:
                timed_out = True
                exit_code = -1
                stdout = exc.stdout or ""
                stderr = exc.stderr or ""
                if isinstance(stdout, bytes):
                    stdout = stdout.decode(errors="replace")
                if isinstance(stderr, bytes):
                    stderr = stderr.decode(errors="replace")
                output = f"{stdout}{stderr}\nCommand timed out after {timeout_seconds:g}s."
            except Exception as exc:
                return tui_server._err(rid, 5003, str(exc))

            duration_seconds = time.monotonic() - started
            output = output.strip() or "(no output)"
            if len(output) > 20_000:
                total = len(output)
                head = output[:9_800]
                tail = output[-9_800:]
                output = f"{head}\n\n… output truncated ({total} chars total) …\n\n{tail}"

            return tui_server._ok(
                rid,
                {
                    "command": command,
                    "cwd": str(cwd_path),
                    "exit_code": exit_code,
                    "duration_seconds": round(duration_seconds, 3),
                    "output": output,
                    "timed_out": timed_out,
                },
            )

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

    if "doctor.status" not in methods:

        @tui_server.method("doctor.status")
        def _(rid, params: dict) -> dict:
            def check(
                check_id: str,
                label: str,
                ok: bool,
                detail: str,
                command: str | None = None,
                warning: bool = False,
            ) -> dict[str, str]:
                status = "ok" if ok else "warning" if warning else "error"
                row = {
                    "id": check_id,
                    "label": label,
                    "status": status,
                    "detail": detail,
                }
                if command:
                    row["command"] = command
                return row

            def parse_node_version(raw: str) -> tuple[int, int, int] | None:
                raw = raw.strip().lstrip("v")
                pieces = raw.split(".")
                if len(pieces) < 2:
                    return None
                try:
                    major = int(pieces[0])
                    minor = int(pieces[1])
                    patch = int(pieces[2]) if len(pieces) > 2 else 0
                    return major, minor, patch
                except ValueError:
                    return None

            def node_ok(version: tuple[int, int, int] | None) -> bool:
                if version is None:
                    return False
                major, minor, patch = version
                return (major == 20 and (minor, patch) >= (19, 0)) or (major > 20 and (major, minor, patch) >= (22, 12, 0))

            checks: list[dict[str, str]] = []

            hermes_root = HERMES_ROOT or Path(os.environ.get("HERMES_AGENT_ROOT", "~/.hermes/hermes-agent")).expanduser()
            hermes_installed = importlib.util.find_spec("tui_gateway.ws") is not None or _has_tui_gateway(hermes_root)
            checks.append(check(
                "hermes_installed",
                "Hermes installed",
                hermes_installed,
                f"Hermes gateway package found at {hermes_root if hermes_root else 'import path'}." if hermes_installed else "Could not locate Hermes Agent's tui_gateway package.",
                "hermes setup",
            ))

            try:
                from hermes_cli.config import load_config

                config = load_config()
                checks.append(check(
                    "config_valid",
                    "Config valid",
                    isinstance(config, dict),
                    "config.yaml loaded successfully." if isinstance(config, dict) else "Config loaded but did not return a mapping.",
                    "hermes config show",
                    warning=not isinstance(config, dict),
                ))
            except Exception as exc:
                checks.append(check(
                    "config_valid",
                    "Config valid",
                    False,
                    f"Could not load Hermes config: {exc}",
                    "hermes setup",
                ))

            try:
                from hermes_cli.main import _has_any_provider_configured

                provider_configured = bool(_has_any_provider_configured())
                checks.append(check(
                    "provider_configured",
                    "Provider configured",
                    provider_configured,
                    "At least one model provider credential is configured." if provider_configured else "No configured provider credentials were detected.",
                    "hermes setup",
                ))
                checks.append(check(
                    "credentials_present",
                    "Credentials present",
                    provider_configured,
                    "Provider credentials are available via Hermes config/.env." if provider_configured else "Add provider credentials through setup or ~/.hermes/.env.",
                    "hermes setup",
                ))
            except Exception as exc:
                checks.append(check(
                    "provider_configured",
                    "Provider configured",
                    False,
                    f"Could not inspect provider credentials: {exc}",
                    "hermes setup",
                ))

            import subprocess

            node_candidates = [
                os.environ.get("HERMES_NATIVE_GUI_NODE"),
                "/opt/homebrew/opt/node@22/bin/node",
                "node",
            ]
            best_node: tuple[str, str, tuple[int, int, int] | None] | None = None
            for candidate in [value for value in node_candidates if value]:
                try:
                    completed = subprocess.run([candidate, "--version"], capture_output=True, text=True, timeout=3)
                    if completed.returncode != 0:
                        continue
                    raw_version = completed.stdout.strip()
                    parsed = parse_node_version(raw_version)
                    if best_node is None or node_ok(parsed):
                        best_node = (candidate, raw_version, parsed)
                    if node_ok(parsed):
                        break
                except Exception:
                    continue
            node_valid = node_ok(best_node[2] if best_node else None)
            checks.append(check(
                "node_version",
                "Node version ok",
                node_valid,
                f"Found {best_node[1]} at {best_node[0]}. Expo needs Node 20.19+ or 22.12+." if best_node else "Node was not found on the bridge PATH.",
                "export PATH=\"/opt/homebrew/opt/node@22/bin:$PATH\" && npm run build:web",
            ))

            python_missing: list[str] = []
            for module_name in ["fastapi", "uvicorn", "tui_gateway.ws"]:
                try:
                    importlib.import_module(module_name)
                except Exception:
                    python_missing.append(module_name)
            checks.append(check(
                "python_deps",
                "Python deps ok",
                not python_missing,
                "Bridge Python dependencies imported successfully." if not python_missing else f"Missing Python module(s): {', '.join(python_missing)}",
                f"{hermes_root}/.venv/bin/python server/bridge.py" if hermes_root else "python server/bridge.py",
            ))


            try:
                completed = subprocess.run(
                    ["hermes", "computer-use", "status"],
                    capture_output=True,
                    text=True,
                    timeout=10,
                )
                computer_use_output = ((completed.stdout or "") + (completed.stderr or "")).strip()
                computer_use_ok = completed.returncode == 0 and "installed" in computer_use_output.lower()
                checks.append(check(
                    "computer_use_cua_driver",
                    "Computer Use / CuaDriver",
                    computer_use_ok,
                    computer_use_output or "Computer Use status did not return output.",
                    "hermes computer-use install --upgrade",
                    warning=completed.returncode == 0 and not computer_use_ok,
                ))
            except Exception as exc:
                checks.append(check(
                    "computer_use_cua_driver",
                    "Computer Use / CuaDriver",
                    False,
                    f"Could not inspect Computer Use setup: {exc}",
                    "hermes computer-use install --upgrade",
                    warning=True,
                ))

            checks.append(check(
                "bridge_reachable",
                "Bridge reachable",
                True,
                f"WebSocket RPC is connected to {SERVICE_NAME} on port {BRIDGE_PORT}.",
                None,
            ))

            return tui_server._ok(rid, {"checks": checks, "generated_at": time.time()})

    @tui_server.method("session.list")
    def session_list_by_last_response(rid, params: dict) -> dict:
        """Order sessions by most recent assistant reply (native GUI)."""
        db = tui_server._get_db()
        if db is None:
            return tui_server._db_unavailable_error(rid, code=5006)
        try:
            deny = frozenset({"tool"})
            limit = int(params.get("limit", 200) or 200)
            fetch_limit = max(limit * 2, 200)
            rows = [
                s
                for s in db.list_sessions_rich(source=None, limit=fetch_limit)
                if (s.get("source") or "").strip().lower() not in deny
            ]
            ids = [str(s["id"]) for s in rows if s.get("id")]
            last_response: dict[str, float] = {}
            if ids:
                placeholders = ",".join("?" for _ in ids)
                with db._lock:
                    cursor = db._conn.execute(
                        f"""
                        SELECT session_id, MAX(timestamp) AS last_response_at
                        FROM messages
                        WHERE role = 'assistant' AND session_id IN ({placeholders})
                        GROUP BY session_id
                        """,
                        ids,
                    )
                    for row in cursor.fetchall():
                        last_response[str(row["session_id"])] = float(row["last_response_at"] or 0)

            for row in rows:
                sid = str(row["id"])
                row["_last_response_at"] = (
                    last_response.get(sid)
                    or row.get("last_active")
                    or row.get("started_at")
                    or 0
                )

            rows.sort(
                key=lambda row: float(row.get("_last_response_at") or 0),
                reverse=True,
            )
            rows = rows[:limit]

            return tui_server._ok(
                rid,
                {
                    "sessions": [
                        {
                            "id": s["id"],
                            "title": s.get("title") or "",
                            "preview": s.get("preview") or "",
                            "started_at": s.get("started_at") or 0,
                            "last_response_at": s.get("_last_response_at") or 0,
                            "message_count": s.get("message_count") or 0,
                            "source": s.get("source") or "",
                        }
                        for s in rows
                    ]
                },
            )
        except Exception as exc:
            return tui_server._err(rid, 5006, str(exc))


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
    db = tui_server._get_db()
    if db is not None and session.get("session_key"):
        try:
            history = db.get_messages_as_conversation(
                session["session_key"],
                include_ancestors=True,
            )
        except Exception:
            pass

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
