# Lifecycle Commands — Full Steps

Detailed handling for each `/mission <verb>`. The Argument Routing table in SKILL.md maps a verb to its action; read this file for the exact steps when handling one. Several are backed by `scripts/mission-state.mjs` (preferred — atomic and compaction-safe).

## `/mission status`

Prefer the script: `node "$MISSION_SCRIPT" status`. Manual equivalent:

1. Read `.missions/active-mission.json`
2. If no file exists, report "No active mission"
3. Display:

```
## Mission: [description]
**Status:** [IN PROGRESS | PAUSED | COMPLETE]
**Mode:** [Standard | Minimal] | **Autonomy:** [Low | Medium | High]
**Elapsed:** [duration since startedAt]

### Phases
[icon] [emoji] [name] [← CURRENT if active] [duration if completed]
...

### Recent Activity
- [last 5 progressLog entries with relative timestamps]
```

## `/mission skip`

1. Read state, find the active phase
2. Ask user to confirm: "Skip [phase name]?"
3. If confirmed:
   - Set the active phase to `status: "skipped"`, `completedAt: <now>`
   - Set the next phase to `status: "active"`, `startedAt: <now>`
   - Add progressLog entry: `{ "type": "phase_complete", "detail": "[phase] skipped" }`
   - Update Tasks (current to completed, next to in_progress)
   - Write state
   - If this was the last phase, mark mission complete
   - Otherwise, read the next phase's protocol and continue

## `/mission pause`

Prefer the script: `node "$MISSION_SCRIPT" pause`. Manual equivalent:

1. Read state
2. Set `paused: true`, `pausedAt: <now>`
3. Add progressLog entry: `{ "type": "mission_pause", "detail": "Mission paused" }`
4. Write state
5. Report: "Mission paused. Use `/mission resume` to continue."
6. Do NOT proceed with any mission work while paused. You may answer questions about the mission.

## `/mission resume`

Prefer the script: `node "$MISSION_SCRIPT" resume`, then read the active phase's protocol. Manual equivalent:

1. Read state
2. Set `paused: false`
3. Move `{ pausedAt, resumedAt: <now> }` to `pauseHistory` array
4. Add progressLog entry: `{ "type": "mission_resume", "detail": "Mission resumed" }`
5. Write state
6. Read the current active phase's protocol and continue execution

## `/mission done`

1. Read state
2. Ask user to confirm: "Mark mission as complete?"
3. If confirmed:
   - Mark the active phase as `done` with `completedAt: <now>`
   - Mark all remaining pending phases as `skipped`
   - Set mission `completedAt: <now>`
   - Add progressLog entry: `{ "type": "mission_complete", "detail": "Mission marked complete by user" }`
   - Update all Tasks accordingly
   - Write state
   - Present a final summary: what was accomplished, phases completed/skipped, total elapsed time

## `/mission log`

Prefer the script: `node "$MISSION_SCRIPT" log`. Manual equivalent:

1. Read `.missions/active-mission.json`
2. If no file exists, report "No active mission"
3. Display the full progress timeline:

```
## Mission Log: [description]
Started: [startedAt] | Elapsed: [total duration]

[timestamp] ▶ Mission started
[timestamp] ✅ Architect complete (Xm Ys)
[timestamp] ✅ Review Plan complete (Xm Ys)
[timestamp] ⏸  Mission paused
[timestamp] ▶  Mission resumed (paused for Xm Ys)
[timestamp] 🔨 Implement — in progress
...

### Phase Durations
- Architect:    Xm Ys
- Review Plan:  Xm Ys
- Implement:    in progress (Xm so far)
- (remaining phases pending)
```

Compute durations from `startedAt`/`completedAt` on each phase. For the active phase, show elapsed time since `startedAt`.

## `/mission handoff`

Manual escape hatch — force a handoff to a new session. The orchestrator does this automatically when failure escalation is exhausted, but you can also trigger it manually at any time.

1. Read `.missions/active-mission.json`
2. If no active mission, report "No active mission to hand off"
3. Generate `.missions/handoff.md` following `references/protocol-handoff.md`
4. Pause the mission (set `paused: true`)
5. Add progressLog entry: `{ "type": "mission_handoff", "detail": "Mission handed off (manual)" }`
6. Write state
7. Report: "Handoff ready. Run `/mission` in a new session to resume with full context."

## `/mission reset`

1. Read state to confirm a mission exists
2. Ask user to confirm: "Reset will delete all mission state. Continue?"
3. If confirmed:
   - Delete `.missions/active-mission.json` and `.missions/handoff.md` (if exists)
   - Report: "Mission state cleared."

> **Reset signal:** If `reset` is run while a phase is active, log a `user-signal` with `type:"reset_mid_flow"` for the active phase's dominant role **before** clearing state (see SKILL.md Argument Routing).
