# Mission Control v2 Implementation Plan

> **For Hermes:** Implement task-by-task with strict TDD for pure timeline/artifact helpers, then UI/typecheck/build verification.

**Goal:** Upgrade Mission Control from a passive subagent tree into a timeline/artifact/result workspace with subagent actions and persisted mission summaries.

**Architecture:** Add pure `src/missionTimeline.ts` helpers that derive timeline entries, artifact summaries, and mission summaries from `SubagentNode[]`/`SubagentProgress[]`. `useHermesRpc` persists completed mission summaries per session in local storage. `MissionControlView` renders the timeline, artifact inventory, final result card, and subagent actions while preserving the existing tree.

**Tech Stack:** React Native / Expo, TypeScript, existing `subagent.*` event reducer and tree helpers.

---

## Task 1: Add mission timeline pure helper tests

**Objective:** Define expected timeline/artifact/summary behavior before UI code.

**Files:**
- Create: `tests/missionTimeline.test.mjs`
- Modify: `scripts/run-unit-tests.mjs` if needed

**Steps:**
1. Add tests using representative subagent progress data.
2. Assert timeline includes planning/delegating/running/tool/progress/completed stages.
3. Assert artifacts collect files read/written, tools, summaries, failures, and counts.
4. Assert completed mission summary contains session id, status, agent count, tool count, files touched, and final summary text.
5. Run `npm run test:unit`; expected RED failure because `src/missionTimeline.ts` does not exist yet.

## Task 2: Implement mission timeline helpers

**Objective:** Make pure tests pass with minimal TypeScript.

**Files:**
- Create: `src/missionTimeline.ts`
- Optionally modify: `src/subagentTypes.ts` if shared exported types are needed

**Steps:**
1. Implement `flattenMissionNodes`, `buildMissionTimeline`, `collectMissionArtifacts`, and `createMissionSummary`.
2. Keep functions deterministic and free of React/native dependencies.
3. Run `npm run test:unit`; expected GREEN.

## Task 3: Persist completed mission summaries

**Objective:** Keep a final mission result available after delegation completes and across reloads.

**Files:**
- Create: `src/missionSummaryStorage.ts`
- Modify: `src/useHermesRpc.ts`

**Steps:**
1. Add web localStorage read/write helpers with safe fallbacks.
2. In `useHermesRpc`, derive `currentMissionSummary` from active session id and subagents.
3. When a mission is complete, save it under gateway id and db session id aliases.
4. Return `currentMissionSummary` and a `missionSummaries` map from the hook.
5. Preserve existing subagent clearing on new/resume session.

## Task 4: Upgrade Mission Control UI

**Objective:** Render timeline, artifacts, persisted result, and useful subagent actions.

**Files:**
- Modify: `src/components/MissionControlView.tsx`
- Modify: `App.tsx`

**Steps:**
1. Add a stage timeline section above the tree.
2. Add an artifact inventory card: files touched, tools, failures, summaries.
3. Add a final mission result card when the summary is complete.
4. Add subagent action buttons: copy goal, copy summary, copy latest tool/progress where available.
5. Keep existing stop/view-chat actions.
6. Allow Mission Control to remain available after completion when a current mission summary exists.

## Verification

- `npm run test:unit`
- `npm run typecheck`
- `npm run build:web`
- Launch via `npm run serve` or reuse existing launcher-backed app.
- Browser connect and console check.
- Visual pass: Mission Control should render timeline/artifact/result sections without clipping and keep composer usable.
