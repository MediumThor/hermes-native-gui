# Needs Attention Inbox Implementation Plan

> **For Hermes:** Implement task-by-task with strict TDD for pure state helpers, then UI/typecheck/build verification.

**Goal:** Add a global inbox for approval, clarification, sudo, and secret prompts across active and background sessions.

**Architecture:** Normalize blocking gateway events into `AttentionRequest` objects in a pure `src/attentionInbox.ts` helper. `useHermesRpc` stores the inbox, adds requests for active/background events, promotes selected requests into existing blocking overlays, and removes requests after successful responses. `App.tsx` renders an `AttentionInbox` banner/card above the workspace so blocked sessions are visible and actionable without switching chats.

**Tech Stack:** React Native / Expo, TypeScript, existing JSON-RPC methods (`approval.respond`, `clarify.respond`, `sudo.respond`, `secret.respond`).

---

## Task 1: Add attention inbox pure helper tests

**Objective:** Define expected normalization/upsert/remove behavior before production code.

**Files:**
- Create: `scripts/run-unit-tests.mjs`
- Create: `tests/attentionInbox.test.mjs`
- Modify: `package.json`

**Steps:**
1. Add a tiny TypeScript transpiling test runner using the existing `typescript` dev dependency.
2. Add tests asserting:
   - approval requests include session id, preview, and stable id.
   - clarify/secret requests include request id and user-facing labels.
   - upserting the same request replaces it instead of duplicating.
   - removing by id clears the request.
3. Run `npm run test:unit`; expected RED failure because `src/attentionInbox.ts` does not exist yet.

## Task 2: Implement attention helper

**Objective:** Make the tests pass with minimal pure TypeScript.

**Files:**
- Create: `src/attentionInbox.ts`

**Steps:**
1. Implement `AttentionRequest` types.
2. Implement `attentionRequestFromEvent`, `upsertAttentionRequest`, `removeAttentionRequest`, and `attentionSessionLabel` helpers.
3. Run `npm run test:unit`; expected GREEN.

## Task 3: Wire inbox state into `useHermesRpc`

**Objective:** Capture active and background blocking events and allow responding through existing RPC methods.

**Files:**
- Modify: `src/types.ts`
- Modify: `src/useHermesRpc.ts`

**Steps:**
1. Extend overlay request types with optional `sessionId` and `attentionId`.
2. Add `attentionRequests` state and ref.
3. In `handleEvent`, create/upsert requests for `approval.request`, `clarify.request`, `sudo.request`, and `secret.request` before active-session filtering.
4. For active session events, keep existing modals but include `sessionId`/`attentionId`.
5. Add `openAttentionRequest(id)` to promote inbox item into existing overlay state.
6. Update answer methods to use the overlay target session/request id and remove the matching attention request on success.
7. For background clarify answers, update cached transcript instead of appending to the active transcript.

## Task 4: Render inbox UI

**Objective:** Make blocked sessions visible and actionable globally.

**Files:**
- Create: `src/components/AttentionInbox.tsx`
- Modify: `App.tsx`
- Modify: `src/components/MainMenu.tsx`

**Steps:**
1. Build a compact global banner/card showing request count, kind, session label, description, and preview.
2. Add `Respond` / `Review` actions that call `openAttentionRequest`.
3. Add `Open chat` action that switches to the affected session when possible.
4. Add header/menu count affordance so blocked work is impossible to miss.
5. Ensure text remains selectable and controls have accessibility labels.

## Verification

- `npm run test:unit`
- `npm run typecheck`
- `npm run build:web`
- Launch via `npm run serve` or reuse existing launcher-backed app.
- Browser connect and console check.
- Visual pass: with real or seeded request state, ensure banner/card has no clipping and does not block composer/overlays.
