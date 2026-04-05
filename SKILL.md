---
name: mission
description: "Orchestrate multi-phase development missions. Use when the user asks to 'start a mission', 'run a mission', or uses /mission with a description. Supports standard (6-phase) and minimal (3-phase) workflows with planning, implementation, testing, audit, and verification."
argument-hint: "[description | status | skip | pause | resume | done | reset]"
---

# Mission — Multi-Phase Development Orchestrator

Orchestrate structured development workflows with distinct phases: plan, review, implement, test, audit, and verify. Each phase has a specialized protocol that controls behavior, ensuring disciplined execution.

## Argument Routing

Parse `$ARGUMENTS` to determine the action:

<arguments>$ARGUMENTS</arguments>

| Argument | Action |
|----------|--------|
| *(empty)* or `status` | Show current mission status |
| `log` | Show full progress timeline |
| `skip` | Skip the current phase |
| `pause` | Pause the mission |
| `resume` | Resume a paused mission |
| `done` | Mark the mission as complete |
| `reset` | Clear all mission state |
| *anything else* | Start a new mission with this as the description |

---

## Starting a New Mission

### 1. Check for Existing Mission

Read `.claude/missions/active-mission.json`. If an active (non-completed) mission exists, inform the user and ask if they want to overwrite it. Do not proceed without confirmation.

### 2. Interactive Setup

Use AskUserQuestion to gather configuration:

**Question 1 — Template** (read `references/templates.md` first for descriptions):
- **Feature** — adding new functionality (Standard, Medium autonomy)
- **Bug Fix** — diagnosing and correcting a defect (Minimal, Low autonomy)
- **Refactor** — restructuring without behavioral change (Standard, Medium autonomy)
- **Investigation** — exploring an unknown area (Minimal, High autonomy)
- **Custom** — no template, configure manually

If a template is selected, apply its default mode and autonomy. Skip Questions 2 and 3 unless the user wants to override.

**Question 2 — Mode** (skip if template selected):
- **Standard (6 phases):** Architect, Review Plan, Implement, Test, Audit, Verify — full rigor for significant features
- **Minimal (3 phases):** Plan, Build, Verify — lightweight for smaller tasks

**Question 3 — Autonomy** (skip if template selected):
- **Low:** Pause after every phase, wait for explicit "continue"
- **Medium:** Pause at phase boundaries for status check (Recommended)
- **High:** Run to completion, only stop on critical failures

**Question 4 — Constraints (optional):**
Ask: "Any constraints or out-of-scope boundaries? (e.g., 'don't touch auth module', 'no new dependencies'). Press enter to skip."

### 3. Read Project Instructions & Set Up Worktree

**Read CLAUDE.md (if present):**
Check for a `CLAUDE.md` file in the project root and any parent directories. This file contains project-specific instructions, conventions, and constraints that override generic behavior. Apply everything in it throughout the mission.

**Set up a git worktree (recommended for standard mode):**
Use the `git-worktree` skill to create an isolated branch for the mission:
```
skill: git-worktree
```
This keeps the default branch clean and allows parallel work without interference. Name the branch after the mission (e.g., `mission/build-user-auth`). If the user declines a worktree, proceed on a new branch or the current branch per their preference.

### 4. Create State File

Create the directory `.claude/missions/` if it doesn't exist, then write `active-mission.json`:

**Standard mode phases:**
```json
[
  { "name": "Architect", "emoji": "\ud83d\udcd0", "status": "active", "startedAt": "<now>" },
  { "name": "Review Plan", "emoji": "\ud83d\udc41\ufe0f", "status": "pending" },
  { "name": "Implement", "emoji": "\ud83d\udd28", "status": "pending" },
  { "name": "Test", "emoji": "\ud83e\uddea", "status": "pending" },
  { "name": "Audit", "emoji": "\ud83d\udd0d", "status": "pending" },
  { "name": "Verify", "emoji": "\u2705", "status": "pending" }
]
```

**Minimal mode phases:**
```json
[
  { "name": "Plan", "emoji": "\ud83d\udccb", "status": "active", "startedAt": "<now>" },
  { "name": "Build", "emoji": "\ud83d\udd28", "status": "pending" },
  { "name": "Verify", "emoji": "\u2705", "status": "pending" }
]
```

Full state schema:
```json
{
  "description": "<mission description>",
  "mode": "standard|minimal",
  "autonomy": "low|medium|high",
  "template": "feature|bugfix|refactor|investigation|custom",
  "constraints": "<optional user-supplied constraints, or null>",
  "phases": [ ... ],
  "paused": false,
  "pauseHistory": [],
  "progressLog": [
    { "timestamp": "<now>", "type": "phase_start", "detail": "Mission started — entering <first phase>" }
  ],
  "startedAt": "<now>",
  "completedAt": null
}
```

If a `template` is set, include its constraints in every phase prompt alongside `constraints`. Read `references/templates.md` for the template's phase emphasis and inject the relevant section when entering each phase.

### 5. Create Phase Tasks

Use TaskCreate to create one task per phase. Use the phase emoji and name as the subject (e.g., "📐 Architect"). Set the first phase task to `in_progress` via TaskUpdate.

### 6. Begin First Phase

Read the appropriate protocol file from this skill's `references/` directory:

| Phase | Protocol File |
|-------|--------------|
| Architect | `references/protocol-planning.md` |
| Plan (minimal) | `references/protocol-planning.md` |
| Review Plan | `references/protocol-review.md` |
| Implement | `references/protocol-implementation.md` |
| Build (minimal) | `references/protocol-minimal-build.md` |
| Test | `references/protocol-testing.md` |
| Audit | `references/protocol-audit.md` |
| Verify | `references/protocol-verification.md` |

Also read `references/autonomy-levels.md` and apply the selected autonomy level's behavior throughout the mission.

Follow the protocol's instructions. Each protocol file includes **Phase Transition** instructions at the end that tell you exactly how to advance to the next phase.

---

## Phase Execution Loop

For each phase:

1. Read the current phase's protocol from `references/`
2. Follow the protocol instructions exactly
3. When the protocol's completion criteria are met, follow the **Phase Transition** steps in that protocol file:
   - Update the state file (mark current phase done, next phase active)
   - Update Tasks (current to completed, next to in_progress)
   - Log the transition in progressLog
   - Read the next phase's protocol
4. Apply autonomy gates:
   - **Low:** After every phase transition, STOP and summarize. Wait for user to say "continue"
   - **Medium:** After every phase transition, briefly summarize progress. Continue unless the user intervenes
   - **High:** Continue automatically through all phases

When the final phase completes, set `completedAt` on the mission state and present a final summary.

---

## Lifecycle Commands

### `/mission status`

1. Read `.claude/missions/active-mission.json`
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

### `/mission skip`

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

### `/mission pause`

1. Read state
2. Set `paused: true`, `pausedAt: <now>`
3. Add progressLog entry: `{ "type": "mission_pause", "detail": "Mission paused" }`
4. Write state
5. Report: "Mission paused. Use `/mission resume` to continue."
6. Do NOT proceed with any mission work while paused. You may answer questions about the mission.

### `/mission resume`

1. Read state
2. Set `paused: false`
3. Move `{ pausedAt, resumedAt: <now> }` to `pauseHistory` array
4. Add progressLog entry: `{ "type": "mission_resume", "detail": "Mission resumed" }`
5. Write state
6. Read the current active phase's protocol and continue execution

### `/mission done`

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

### `/mission log`

1. Read `.claude/missions/active-mission.json`
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

### `/mission reset`

1. Read state to confirm a mission exists
2. Ask user to confirm: "Reset will delete all mission state. Continue?"
3. If confirmed:
   - Delete `.claude/missions/active-mission.json`
   - Report: "Mission state cleared."

---

## Session Continuity

When `/mission` is invoked with no arguments in a new session:

1. Read `.claude/missions/active-mission.json`
2. If an active mission exists, display its status
3. If the mission is not paused and not complete, offer to resume:
   - Read the current phase's protocol
   - Continue execution from where the previous session left off

The state file contains all information needed to fully reconstruct context without any session-specific storage.

---

## Important Notes

- The state file is the single source of truth. Always read before modifying, write after every change.
- Each protocol file in `references/` is self-contained with its own completion criteria and phase transition instructions.
- Never skip the Review/approval gate — it exists to prevent wasted implementation effort.
- If the state file is missing or corrupted, report the error and suggest `/mission reset`.
