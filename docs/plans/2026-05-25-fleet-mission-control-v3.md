# Fleet Mission Control v3 Implementation Plan

> **For Hermes:** Implement task-by-task with strict TDD for pure fleet helpers, then UI/typecheck/build verification.

**Goal:** Upgrade Mission Control from a single-session delegation dashboard into a **fleet command center** for multiple independent Hermes sessions — while explicitly **not** building direct prompt-to-subagent controls.

**Architecture:** Add pure `src/fleetMission.ts` helpers that derive a normalized fleet snapshot from existing session state (`runningSessionIds`, `sessionRuntime`, `sessions`, `missionSummaries`, `attentionRequests`, optional per-session subagent/delegation flags). `useHermesRpc` exposes fleet-level actions (`sendPromptToSession`, `spawnAgentWithGoal`, `interruptSessionById`, `focusSession`) without changing Hermes gateway semantics. `FleetMissionControlView` replaces or extends the current Mission Control entry point with a multi-session dashboard, unified target-aware composer, and per-session cards. Attention routing builds on the existing `AttentionInbox` pattern.

**Tech Stack:** React Native / Expo, TypeScript, existing JSON-RPC methods (`session.create`, `prompt.submit`, `session.steer`, `session.interrupt`, `session.resume`, `session.status`), existing `missionTimeline` / `missionSummaryStorage`, existing `attentionInbox`.

---

## Product decisions (locked for v3)

| Approach | Verdict | v3 scope |
| --- | --- | --- |
| **Fleet Mission Control** (multi-session command center) | Yes | **Build now** |
| **Direct prompt-to-subagent** | No | **Explicit non-goal** |
| **Mission templates** (“research + implement”) | Yes, later | **Design hooks only** |

### Non-goals (do not implement in v3)

- Prompting individual subagents directly (`subagent_id` targeting).
- Cross-session file locking or git coordination.
- Automatic merge/synthesis of unrelated session outputs.
- Replacing the normal Chat pane for single-session work.

### UX north star

```text
Fleet Mission Control
├── Active fleet (all running sessions)
├── Per-agent cards (status, activity, summary, Stop, Open chat)
├── Unified prompt bar with target selector
└── New agent → session.create + prompt.submit
```

When the **active session** is delegating subagents, its card may expand inline subagent detail (reuse current `MissionControlView` sections) — but fleet view remains session-centric, not subagent-centric.

---

## Current foundation (reuse, do not rewrite)

Already available in the GUI:

- **Multi-session runtime:** switching chats does not stop background agents (`App.tsx` comment + `runningSessionIds`).
- **Per-session runtime tracking:** `sessionRuntime`, `markSessionRunning/Idle/Blocked`, `pollLiveSessions`.
- **Session targeting RPC:** `prompt.submit`, `session.steer`, `session.interrupt`, `session.create`, `session.resume`.
- **Mission summaries (single session):** `missionSummaries`, `createMissionSummary`, `MissionControlView` result card.
- **Attention inbox (multi-session blocking):** `attentionInbox.ts`, `AttentionInbox.tsx`, `openAttentionRequest`.
- **Delegation view (single session):** `MissionControlView`, `subagentTree`, timeline/artifacts.

v3 mostly **aggregates and routes** existing capabilities.

---

## Task 1: Define fleet snapshot pure helpers (TDD)

**Objective:** Specify how multiple sessions are normalized into one fleet model before UI work.

**Files:**
- Create: `tests/fleetMission.test.mjs`
- Create: `src/fleetMission.ts`

**Types to introduce:**

```ts
export type FleetSessionStatus = "running" | "blocked" | "idle" | "completed";

export type FleetSessionCard = {
  sessionId: string;           // canonical db key when known
  gatewayId: string | null;    // live gateway id when known
  label: string;
  status: FleetSessionStatus;
  activity: string;
  isActive: boolean;
  isDelegating: boolean;
  attentionCount: number;
  missionSummary: MissionSummary | null;
  updatedAt: number;
};

export type FleetSnapshot = {
  sessions: FleetSessionCard[];
  runningCount: number;
  blockedCount: number;
  completedCount: number;
};
```

**Steps:**
1. Add tests for `buildFleetSnapshot(...)` using fixture maps for runtime, sessions list, mission summaries, attention requests, and active session id.
2. Assert cards are deduped across gateway/db aliases (same agent must not appear twice).
3. Assert `blocked` wins over `running` when session has open attention requests.
4. Assert recently completed missions appear even when no longer running (from `missionSummaries`).
5. Assert sort order: blocked first, then running, then completed/idle; tie-break by `updatedAt` desc.
6. Add tests for `fleetPromptTargetOptions(snapshot)` returning `{ id, label, kind: "session" | "new" }`.
7. Run `npm run test:unit`; expected RED.

---

## Task 2: Extend RPC layer with fleet actions

**Objective:** Expose session-targeted operations without breaking the active-session chat model.

**Files:**
- Modify: `src/useHermesRpc.ts`
- Modify: `src/types.ts` (only if new exported hook types are needed)

**New hook surface:**

```ts
buildFleetSnapshot(): FleetSnapshot;
sendPromptToSession(targetSessionId: string, text: string): Promise<void>;
spawnAgentWithGoal(text: string): Promise<string>; // returns new gateway session id
interruptSessionById(targetSessionId: string): Promise<void>;
focusSession(targetSessionId: string): Promise<void>; // resume/open without clearing fleet context
```

**Steps:**
1. Add `buildFleetSnapshot` memo derived from existing state (`runningSessionIds`, `sessionRuntime`, `sessions`, `missionSummaries`, `attentionRequests`, `sessionId`, `subagents`, `delegationActive`).
2. Implement `sendPromptToSession`:
   - Resolve gateway id via `sessionKeyByGatewayId` / `gatewayIdBySessionKey`.
   - If target is active session, reuse existing `sendPrompt` / queue behavior.
   - If target is background session, call `prompt.submit` directly; on busy error, surface status message (queueing across sessions is optional stretch — start with clear error/toast).
3. Implement `spawnAgentWithGoal`:
   - `session.create` → `prompt.submit` → register in tracker → return id.
   - Do **not** auto-switch active chat unless user chooses “Open after spawn”.
4. Implement `interruptSessionById`:
   - Resolve gateway id; call `session.interrupt`.
   - Only mutate local `messages/subagents/busy` when interrupting the **active** session.
5. Implement `focusSession`:
   - Wrap existing `resumeSession` / `focusLiveSession` without clearing fleet mode.
6. Keep all event handling unchanged; fleet is a view + router, not a new gateway protocol.

---

## Task 3: Fleet Mission Control UI shell

**Objective:** Add a dedicated fleet dashboard and entry points.

**Files:**
- Create: `src/components/FleetMissionControlView.tsx`
- Modify: `src/components/MissionControlView.tsx` (extract shared card primitives if useful)
- Modify: `App.tsx`
- Modify: `src/components/MainMenu.tsx`

**Layout:**

```text
┌ Fleet Mission Control ────────────────────────────────┐
│ [Blocked: 1] [Running: 2] [Completed: 1]            │
├ Attention strip (reuse AttentionInbox compact mode) ┤
├ Session cards (scroll) ──────────────────────────────┤
│  ◉ Session A  running · "Reading package.json…"     │
│     [Open chat] [Stop]                               │
│  ⚠ Session B  blocked · Approval needed             │
│     [Respond] [Open chat]                            │
│  ✓ Session C  completed · Mission summary preview    │
│     [View summary] [Open chat]                       │
├ Unified composer ────────────────────────────────────┤
│ Target: [Session A ▼]  [message…]            [Send]  │
│ [+ New agent]                                        │
└──────────────────────────────────────────────────────┘
```

**Steps:**
1. Add menu item / header action: **Fleet** (or rename Chat submenu when fleet is active).
2. Add `fleetMode` UI state in `App.tsx`:
   - `off` — normal chat
   - `session-delegation` — existing Mission Control for active delegated session
   - `fleet` — new multi-session dashboard
3. Auto-enter `fleet` when `runningSessionIds.length > 1` (optional, behind setting default off to avoid jarring switches).
4. Manual entry always available from main menu: **“Fleet Mission Control”**.
5. Build `FleetSessionCard` rows from `FleetSnapshot`.
6. Reuse `MissionControlView` summary/artifact sections inside a card when user expands a delegated active session (stretch goal within Task 3 if timeboxed).

---

## Task 4: Unified target-aware composer

**Objective:** One prompt box that can target any session or spawn a new agent.

**Files:**
- Create: `src/components/FleetPromptComposer.tsx`
- Modify: `App.tsx` or `FleetMissionControlView.tsx`

**Behavior:**
1. Target dropdown options from `fleetPromptTargetOptions(snapshot)`:
   - Active session (default when in fleet view)
   - Each running/blocked session
   - **New agent…** (spawns via `spawnAgentWithGoal`)
2. Enter sends to selected target via `sendPromptToSession` / `spawnAgentWithGoal`.
3. Double-enter / queue semantics:
   - v3: preserve existing queue behavior for **active** session only.
   - Background targets: show clear busy/error status; no silent cross-session queue yet.
4. Show target chip on sent optimistic messages only for active session (background sends do not pollute active transcript).
5. Accessibility: combo box labels include session label + short id.

---

## Task 5: Attention routing upgrades for fleet

**Objective:** Make multi-session blocking visible and actionable from fleet view without switching chats blindly.

**Files:**
- Modify: `src/components/AttentionInbox.tsx`
- Modify: `src/components/FleetMissionControlView.tsx`
- Modify: `src/useHermesRpc.ts` (only if session label resolution needs fleet helpers)

**Steps:**
1. Add compact inbox strip at top of fleet view (reuse `AttentionInbox` with `variant="compact"` prop).
2. Each fleet card shows attention badge count; blocked cards pin to top (already in snapshot sort).
3. **Respond** on card calls `openAttentionRequest` then promotes overlay (existing modal flow).
4. **Open chat** on card calls `focusSession` then optionally exits fleet mode.
5. Ensure overlay responses always use the request’s `sessionId`, not active session fallback.
6. After respond, refresh fleet snapshot (runtime + attention list).

---

## Task 6: Per-session mission summaries in fleet

**Objective:** Completed work remains reviewable across sessions from one screen.

**Files:**
- Modify: `src/missionSummaryStorage.ts` (only if multi-session indexing needs helpers)
- Modify: `src/fleetMission.ts`
- Modify: `src/components/FleetMissionControlView.tsx`

**Steps:**
1. Include `missionSummaries` entries in fleet cards even when session is idle/not running.
2. Card states:
   - **Running/delegating:** activity line + optional inline subagent count
   - **Completed:** summary preview (first ~160 chars) + “Copy summary”
   - **Failed/interrupted:** destructive badge + summary/error text
3. “View summary” expands card inline (don't navigate away).
4. Persist summaries keyed by both gateway and db session ids (already supported — verify fleet dedupe uses canonical id).

---

## Task 7: Session-scoped stop + safety UX

**Objective:** Stop individual agents safely from fleet view.

**Files:**
- Modify: `src/components/FleetMissionControlView.tsx`
- Modify: `App.tsx` (confirm modal reuse)

**Steps:**
1. **Stop** on card → confirm → `interruptSessionById`.
2. Disable Stop for already-idle sessions.
3. If stopping active session while user is in fleet view, do not force navigation to chat.
4. Show post-stop status on card (`Stopped`, `Interrupted`).
5. Log/status line at bottom: `Stopped session abc123 · Ready`.

---

## Task 8: Explicit non-goal guardrails + docs

**Objective:** Prevent scope creep into direct subagent prompting.

**Files:**
- Modify: `README.md`
- Create: `docs/plans/2026-05-25-mission-templates-v4.md` (stub only)

**Steps:**
1. Document Fleet Mission Control in README (entry points, target composer, multi-session model).
2. Document **non-goal:** no subagent direct prompt UI until Hermes gateway exposes a supported API.
3. Add v4 stub plan for mission templates (predefined multi-session spawn patterns on top of fleet view).

---

## Future: Mission templates (v4 — not v3)

**Do not implement in v3.** Design hooks only:

```text
Template: Research + Implement
├── Spawn session A with research prompt
├── Spawn session B with implementation prompt (blocked until A completes — optional)
└── Fleet view tracks both; user reviews summaries manually
```

Requires:
- Template definitions (JSON/TS config)
- Batch `spawnAgentWithGoal` orchestration
- Optional dependency edges between fleet cards
- No subagent bypass

---

## Navigation matrix

| User action | Result |
| --- | --- |
| Open **Fleet Mission Control** from menu | Fleet dashboard |
| Agent starts delegating in active chat | Existing session Mission Control (unchanged) |
| Second session starts running elsewhere | Banner + fleet badge count; optional auto-suggest fleet |
| Send from fleet composer with target = Session B | `prompt.submit` to Session B |
| Send with target = New agent | `session.create` + `prompt.submit` |
| Stop on card | `session.interrupt` for that session |
| Respond on blocked card | Existing attention overlay |
| Open chat on card | `focusSession`; exit fleet optional |

---

## Verification

### Automated
- `npm run test:unit` (includes new `fleetMission.test.mjs`)
- `npm run typecheck`
- `npm run build:web`

### Manual test plan
1. Connect bridge; open Session A; send a long-running prompt.
2. Start **New chat** (Session B); send another prompt without stopping A.
3. Open **Fleet Mission Control** — both sessions visible, correct activity lines.
4. Send a prompt to Session A from fleet composer while viewing fleet (Session B active or none).
5. Spawn **New agent** from fleet composer; confirm third card appears.
6. Trigger approval/clarify on background session; verify blocked badge + Respond works without losing fleet context.
7. Stop Session A from fleet card; verify Session B keeps running.
8. Complete a delegated mission in one session; verify mission summary appears on that card after completion.
9. Reload page; completed summary still visible from `missionSummaries` storage.

### Visual pass
- Fleet cards, attention strip, and composer do not clip on narrow widths.
- Text remains selectable; buttons have accessibility labels.
- Fleet view coexists with existing Chat + session Mission Control (no regressions).

---

## Suggested implementation order

1. Task 1 — pure fleet snapshot (TDD)
2. Task 2 — hook actions
3. Task 3 — fleet shell + menu entry
4. Task 4 — target composer
5. Task 5 — attention routing
6. Task 6 — mission summaries on cards
7. Task 7 — stop UX
8. Task 8 — docs + v4 stub

**Estimated scope:** ~3–5 focused dev sessions for Tasks 1–7; Task 8 is short.

---

## Open questions (resolve before coding Task 2)

1. **Auto-enter fleet mode** when `runningSessionIds.length > 1` — default off recommended.
2. **Background prompt queue** — defer to v3.1 or implement simple “busy, try steer” fallback?
3. **Menu placement** — new top-level **Fleet** pane vs sub-entry under Chat/Mission Control?
4. **Card expansion** — inline subagent tree for active delegated session, or link to existing session Mission Control?

Recommended defaults: auto-enter off; no cross-session queue in v3; top-level Fleet menu item; link to session Mission Control for deep subagent detail.
