# Hermes Native GUI — Security Review

**Date:** 2026-05-24  
**Last updated:** 2026-05-24 (post-hardening pass)  
**Scope:** `/Users/ryan/Desktop/hermes-native-gui` (source, launcher, bridge, static web UI)  
**Stack:** React Native / Expo (TypeScript), Node static server, FastAPI WebSocket bridge (Python)

## Executive Summary

This repo is a **local-only control surface for a powerful agent** (Hermes). The bridge now requires a per-run auth token, validates browser WebSocket `Origin`, disables FastAPI docs, minimizes `/health`, and serves the static UI with baseline security headers.

**Overall posture:** Acceptable for cautious local-only use with the bridge bound to `127.0.0.1`. Not safe to expose remotely without authentication, TLS, and strict origin controls.

---

## Critical

### Finding 1 — Cross-site WebSocket hijacking on localhost bridge — **ADDRESSED**

| Field | Detail |
| --- | --- |
| **Status** | Fixed |
| **Location** | `server/bridge.py` |
| **Fix applied** | WebSocket handshake validates `Origin` against allowed local UI origins. Connections also require the bridge token query param. |
| **Verification** | `npm run verify:security` rejects bad origins; allowed origin + token succeeds. |

### Finding 2 — Unauthenticated privileged JSON-RPC surface — **ADDRESSED**

| Field | Detail |
| --- | --- |
| **Status** | Fixed |
| **Location** | `server/bridge.py`, `src/bridgeSecurity.ts`, `bin/hermes-native-gui.js` |
| **Fix applied** | Launcher generates/passes token; bridge persists `~/.hermes/hermes-native-gui-bridge-<port>.token`; UI resolves token from URL/sessionStorage/`/bridge-config.json` and appends it to the WebSocket URL. |
| **Verification** | Missing/wrong token connections are rejected. |

---

## High

### Finding 3 — Remote bind escape hatch without layered controls — **PARTIALLY ADDRESSED**

| Field | Detail |
| --- | --- |
| **Status** | Restricted by design; full remote hardening deferred |
| **Location** | `server/bridge.py`, `README.md` |
| **Fix applied** | Non-loopback bind still requires `HERMES_NATIVE_GUI_ALLOW_REMOTE=1`, and remote bind now also requires an explicit `HERMES_NATIVE_GUI_BRIDGE_TOKEN`. README warns that raw `ws://` is not safe without TLS or a secure tunnel. |
| **Remaining gap** | No built-in TLS/`wss://` terminator. Use a secure tunnel or local reverse proxy for true remote use. |

### Finding 4 — Sudo passwords and secrets sent in plaintext over `ws://` — **PARTIALLY ADDRESSED**

| Field | Detail |
| --- | --- |
| **Status** | Mitigated for localhost; transport risk remains if URL is misconfigured |
| **Fix applied** | Bridge URL allowlist in `src/bridgeSecurity.ts`; secure input modal clears state after submit/cancel. |
| **Remaining gap** | Loopback `ws://` is still plaintext by design. Do not point the UI at non-local bridges. |

---

## Medium

### Finding 5 — `/health` leaks filesystem layout — **ADDRESSED**

Returns only `{ "ok": "true", "service": "hermes-native-gui-bridge" }`.

### Finding 6 — Configurable bridge URL without validation — **ADDRESSED**

`normalizeBridgeUrl()` / `isAllowedBridgeUrl()` restrict endpoints to loopback `/ws` URLs.

### Finding 7 — Launcher trusts any process already listening on bridge port — **ADDRESSED**

Launcher verifies `/health.service === "hermes-native-gui-bridge"` and requires the token file before reusing an existing bridge.

### Finding 8 — Static web server lacks security headers / CSP — **ADDRESSED**

`bin/hermes-native-gui.js` sends CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer`.

### Finding 9 — FastAPI interactive docs likely exposed on bridge port — **ADDRESSED**

FastAPI docs/redoc/openapi are disabled in `server/bridge.py`.

### Finding 10 — Moderate npm advisory chain in Expo toolchain — **OPEN**

Track via `npm audit`; major Expo upgrade deferred to avoid RN/Web regressions.

---

## Low

### Finding 11 — Sensitive input state not cleared after submit — **ADDRESSED**

`SecureInputModal.tsx` clears value state on submit and cancel.

### Finding 12 — Default unknown RPC `.request` events rendered into chat — **ADDRESSED**

Unknown `*.request` events now render a bounded, redacted summary via `summarizeUnknownRequest()`.

---

## Positive Controls Observed

- Bridge refuses non-localhost bind unless `HERMES_NATIVE_GUI_ALLOW_REMOTE=1`.
- Remote bind requires explicit bridge token.
- README documents bridge/token/origin model and remote-use warnings.
- Static file server binds to `127.0.0.1` only.
- Static path handling uses normalized paths with `startsWith(DIST)` guard.
- No `eval`, `innerHTML`, or `dangerouslySetInnerHTML` in app source.
- Blocking overlays gate approval/sudo/secret prompts.
- Secure text entry for sudo/secret modals.

---

## Verification Checklist

- [x] Confirm malicious origin cannot open `/ws` while bridge runs locally.
- [x] Confirm bridge rejects connections without startup token.
- [x] Confirm `/docs` and `/openapi.json` are unavailable on bridge port.
- [x] Confirm static server sends CSP and frame protections.
- [ ] Re-run `npm audit` after dependency upgrades.

Run automated checks:

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
npm run serve
npm run verify:security
```
