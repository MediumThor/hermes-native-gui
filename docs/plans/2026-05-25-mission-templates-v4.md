# Mission Templates v4 Implementation Plan (Stub)

> **Status:** Deferred until Fleet Mission Control v3 ships. Do not implement before `docs/plans/2026-05-25-fleet-mission-control-v3.md` is complete.

**Goal:** Let users launch predefined multi-session workflows from Fleet Mission Control (e.g. “Research + Implement”) without direct subagent prompting.

**Depends on:** `spawnAgentWithGoal`, `buildFleetSnapshot`, `FleetMissionControlView`, persisted `missionSummaries`.

**Likely shape:**
- Template config: name, description, session definitions (title, initial prompt, optional model/tool hints).
- Optional dependency edges (Session B suggested after Session A completes — user-confirmed, not automatic file handoff).
- Fleet UI: “New from template…” alongside “New agent”.
- No subagent bypass; each template session is a normal Hermes session.

**Non-goals:** Cross-session git merge, automatic synthesis agent, subagent direct prompt.

See Fleet v3 plan for locked product decisions.
