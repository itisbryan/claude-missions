---
name: mission
description: "Orchestrate multi-phase development missions. Use when the user asks to 'start a mission', 'run a mission', or uses /mission with a description. Supports standard (6-phase) and minimal (3-phase) workflows with planning, implementation, testing, audit, and verification."
argument-hint: "[description | status | skip | pause | resume | done | reset]"
---

# Mission — Multi-Phase Development Orchestrator

Orchestrate structured development workflows with distinct phases: plan, review, implement, test, audit, and verify. Each phase has a specialized protocol that controls behavior, ensuring disciplined execution.

## Obsidian Integration

When `secondBrain` is set in the mission state, this skill integrates with the `/obsidian` skill:

- **Architect phase**: reads `.vault-index.json` first to find prior decisions, patterns, and domain knowledge relevant to the mission. References vault notes in the spec.
- **Implement phase**: checks vault for prior decisions about files being changed. Checks `code-todos.md` for existing TODOs to address. After implementation, runs a TODO scan on changed files.
- **Audit phase**: passes vault context (prior decisions, architecture notes) to the Business Logic reviewer. Reports leftover TODO/FIXME count.
- **Verify phase**: checks for zero unresolved FIXMEs as a pass condition.
- **All phases**: save outputs to the vault (discovery, plan, review notes, implementation log, audit report, verification report, decisions).

**Vault-first rule**: before exploring code for architectural or design questions, search the vault index first — the answer may already be documented.

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
| `handoff` | Generate handoff doc and pause for session transfer |
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

**Question 5 — Model Assignment:**
Present the default model mappings and let the user customize. These control which Claude model runs each subagent role, balancing cost vs. capability:

| Role | Default | Used in | Why |
|------|---------|---------|-----|
| Explorer | haiku | Architect: 3 parallel discovery agents | Fast, cheap codebase scanning |
| Planner | opus | Architect: spec writing; Review: plan review | Strong reasoning for planning |
| Worker | sonnet | Implement/Build: parallel code subagents | Good balance of speed and quality |
| Business Reviewer | sonnet | Audit: spec alignment + business logic | Catches missed requirements |
| Security Reviewer | sonnet | Audit: injection, auth, secrets, exposure | Dedicated security lens |
| Edge Case Reviewer | sonnet | Audit: boundaries, nulls, partial failures | Catches what happy-path misses |
| Reviewer | sonnet | Audit: async/concurrency + perf/architecture | Remaining audit lenses |
| Verifier | sonnet | Verify: test + lint runner | Needs to run tools reliably |

Use AskUserQuestion to show these defaults and let the user override any role. Accept "defaults" to skip customization.

**Question 6 — Second Brain (optional):**
Ask: "Save mission docs to a second brain vault (e.g., Obsidian)? Provide the directory path, or press enter to skip."

If a path is provided:
- Validate the directory exists
- Store it as `secondBrain` in the state file
- Each phase will write its outputs as Obsidian-compatible markdown to `<secondBrain>/missions/<mission-slug>/`
- See `references/protocol-second-brain.md` for the output format

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
  { "name": "Architect", "emoji": "\ud83d\udcd0", "status": "active", "startedAt": "<now>", "completedAt": null },
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
  "secondBrain": "<path to vault directory, or null>",
  "modelAssignment": {
    "explorer": "haiku",
    "planner": "opus",
    "worker": "sonnet",
    "business_reviewer": "sonnet",
    "security_reviewer": "sonnet",
    "edge_case_reviewer": "sonnet",
    "reviewer": "sonnet",
    "verifier": "sonnet"
  },
  "phases": [ ... ],
  "performanceLog": [
    {
      "agent": "explorer-1",
      "role": "explorer",
      "model": "haiku",
      "phase": "Architect",
      "task": "description",
      "scores": { "quality": 4, "completeness": 3, "efficiency": 5, "composite": 3.9 },
      "verdict": "solid",
      "feedback": "actionable feedback"
    }
  ],
  "failureLog": [
    {
      "workItem": "feature id",
      "attempts": [
        { "attempt": 1, "session": 1, "approach": "...", "error": "...", "timestamp": "..." }
      ],
      "totalAttempts": 0,
      "escalatedTo": null,
      "resolved": false
    }
  ],
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

The `/mission` command is the **orchestrator**. It owns all decisions: which subagents to spawn, when to retry, when to escalate, and when to hand off. Subagents are workers — they report results back, they don't make orchestration decisions.

### Compaction Resilience

Context compaction can happen at any time — after a subagent returns, between phases, or mid-phase. The orchestrator MUST be stateless between steps. **Never rely on conversation memory for mission state.**

**Rule: re-read state before every decision.** Specifically:

1. **After every subagent returns** — run `node ~/.claude/skills/mission/scripts/mission-state.mjs get phases` to know where you are. Don't assume you remember which work item was being processed.
2. **Before every phase transition** — re-read the full state file. Compaction may have removed the setup context (template, constraints, model assignment).
3. **Before dispatching a subagent** — re-read `failureLog` and `performanceLog` from state. Don't rely on conversation memory for attempt counts or scores.
4. **If you feel disoriented** — run `node ~/.claude/skills/mission/scripts/mission-state.mjs status`. The state file is the single source of truth.

The state file + scripts make the orchestrator resilient to compaction. Even if 100% of conversation context is lost, the mission can continue from the state file alone.

### After Every Subagent Returns

1. **Re-read state**: `node ~/.claude/skills/mission/scripts/mission-state.mjs get phases` — confirm which phase is active, which work item is current
2. Evaluate the subagent's output using `references/protocol-scoring.md`
3. Score quality (1-5), completeness (1-5), efficiency (1-5)
4. Write specific, actionable feedback
5. Log the score: `node ~/.claude/skills/mission/scripts/mission-state.mjs score '<json>'`
6. Feed scores into the next subagent's prompt

See `references/protocol-scoring.md` for the full rubric.

### Phase Loop

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

## Orchestrator Failure & Handoff Loop

The orchestrator manages all retries, escalations, and handoffs. Subagents never decide these — they just return success or failure.

```
Subagent returns failure
        ↓
Orchestrator logs attempt to failureLog in state file
        ↓
Total attempts ≥ 6? ──yes──→  HARD STOP: mark work item as blocker, ask user
        ↓ no
Attempt < 3 (this session)?  ──yes──→  Spawn new subagent (different approach)
        ↓ no
Escalate to Opus debug agent (model: opus) with full failure log
        ↓
Opus succeeds? ──yes──→  Continue to next work item
        ↓ no
Auto-generate handoff.md → Pause mission → Inform user
```

### Guards Against Infinite Loops

- **Per-work-item ceiling:** Max **3 attempts per session** + 1 Opus escalation. This is enforced by counting `attempts` in the `failureLog` entry for this work item.
- **Cross-session ceiling:** Max **6 total attempts** across ALL sessions for any single work item. If a handoff resumes and the same item has already been tried 6 times total, STOP — do not retry. Mark the work item as a **blocker** and ask the user: "This item has failed 6 times across sessions. Skip it (`/mission skip`), fix it manually, or abort?"
- **Autonomy override:** The failure/handoff loop **always pauses** after Opus fails, regardless of autonomy level. Even on High autonomy, exhausted retries force a pause. This prevents runaway loops.
- **Only the orchestrator writes state:** Subagents never write to `active-mission.json`. They return results to the orchestrator, which is the single writer. This prevents race conditions when parallel subagents run.

### How it works step by step

1. **Before dispatching**, orchestrator reads `failureLog` for this work item:
   - If total attempts ≥ 6 → HARD STOP, ask user
   - If attempts this session ≥ 3 → skip to Opus escalation
2. **Orchestrator dispatches a subagent** for the work item
3. **Subagent returns** success or failure
4. **Orchestrator receives the result** and decides:
   - **Success** → log it, move to next work item
   - **Failure, attempt 1-2** → log the error and approach to `failureLog`, spawn a new subagent with instructions: "Previous attempts failed: [details]. Do NOT repeat these approaches."
   - **Failure, attempt 3** → log it, spawn an Opus debug agent with the full failure history
   - **Opus succeeds** → mark `resolved: true`, continue
   - **Opus fails** → auto-write `handoff.md`, pause mission, inform user
5. **New session** runs `/mission` → orchestrator reads state + `handoff.md` → checks total attempt count before retrying

### What subagents know

Subagents receive:
- The work item goal, files, approach
- Previous failure details (so they don't repeat)
- CLAUDE.md summary and constraints

Subagents do NOT:
- Track their own attempt count
- Decide to escalate or hand off
- Write to `failureLog` or `active-mission.json` (the orchestrator does this)
- Know about other subagents or the mission state

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

### `/mission handoff`

Manual escape hatch — force a handoff to a new session. The orchestrator does this automatically when failure escalation is exhausted, but you can also trigger it manually at any time.

1. Read `.claude/missions/active-mission.json`
2. If no active mission, report "No active mission to hand off"
3. Generate `.claude/missions/handoff.md` following `references/protocol-handoff.md`
4. Pause the mission (set `paused: true`)
5. Add progressLog entry: `{ "type": "mission_handoff", "detail": "Mission handed off (manual)" }`
6. Write state
7. Report: "Handoff ready. Run `/mission` in a new session to resume with full context."

### `/mission reset`

1. Read state to confirm a mission exists
2. Ask user to confirm: "Reset will delete all mission state. Continue?"
3. If confirmed:
   - Delete `.claude/missions/active-mission.json` and `.claude/missions/handoff.md` (if exists)
   - Report: "Mission state cleared."

---

## Session Continuity

When `/mission` is invoked with no arguments in a new session:

1. Read `.claude/missions/active-mission.json`
2. If an active mission exists, display its status
3. Check for `.claude/missions/handoff.md`:
   - If present, read it — this contains full context from the previous session including what was tried, what failed, and what's next
   - Delete the handoff file after reading (it's been consumed)
   - Resume the mission (set `paused: false`)
4. If the mission is not paused and not complete:
   - Read the current phase's protocol
   - If there are entries in `failureLog` for the current work, review them before retrying — do NOT repeat the same approaches that already failed
   - Continue execution from where the previous session left off

The state file + handoff document contain all information needed to fully reconstruct context.

---

## State Validation

Every time the state file is read, validate before proceeding:

1. **File exists?** If not → "No active mission" (or offer to reconstruct from `handoff.md` if that exists)
2. **Valid JSON?** If parse fails → report the error, suggest `/mission reset`
3. **Required fields present?** Check: `description`, `mode`, `phases` (array with ≥1 entry), `autonomy`, `startedAt`. If any missing → report and suggest reset
4. **modelAssignment complete?** For standard mode, all 8 roles must be present. For minimal, at least `explorer`, `planner`, `worker`, `verifier`. If a role is missing → fill it with `"sonnet"` as fallback and warn the user
5. **Exactly one active phase?** If zero → mission may be complete (check `completedAt`) or stuck (suggest reset). If more than one → set the first active one as the real active phase, mark others as pending
6. **Phase order valid?** Done phases must come before active, active before pending. If out of order → warn and suggest reset

## Important Notes

- The state file is the single source of truth. Always read before modifying, write after every change.
- **Only the orchestrator writes to the state file.** Subagents return results; the orchestrator updates state. This prevents race conditions.
- **Use scripts for deterministic operations** to save tokens. Run these via Bash instead of doing the work yourself:
  - `~/.claude/skills/mission/scripts/mission-state.mjs status` — formatted mission status
  - `~/.claude/skills/mission/scripts/mission-state.mjs phase-transition` — advance to next phase atomically
  - `~/.claude/skills/mission/scripts/mission-state.mjs pause` / `resume` — toggle pause
  - `~/.claude/skills/mission/scripts/mission-state.mjs log` — full progress timeline
  - `~/.claude/skills/mission/scripts/mission-state.mjs score '<json>'` — append performance score
  - `~/.claude/skills/mission/scripts/mission-state.mjs failure '<json>'` — append failure log entry
  - `~/.claude/skills/mission/scripts/mission-state.mjs tokens` — token usage report by phase and role
  - `~/.claude/skills/mission/scripts/mission-state.mjs get <field>` — read a field from state
  - `~/.claude/skills/obsidian/scripts/todo-scan.mjs [dir] [--vault <path>]` — scan code for TODO/FIXME
  - `~/.claude/skills/obsidian/scripts/vault-index.mjs <vault-path>` — build vault index
  - `~/.claude/skills/obsidian/scripts/vault-audit.mjs <vault-path>` — check vault health
- Each protocol file in `references/` is self-contained with its own completion criteria and phase transition instructions.
- Never skip the Review/approval gate — it exists to prevent wasted implementation effort.
- If `handoff.md` exists but state file is missing, offer to reconstruct state from the handoff document or reset.
- **Template constraints and user constraints are additive.** If they conflict, template constraints take priority. Warn the user at setup if a conflict is detected.
