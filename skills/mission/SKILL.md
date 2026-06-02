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
| `handoff` | Generate handoff doc and pause for session transfer |
| `done` | Mark the mission as complete |
| `reset` | Clear all mission state |
| *anything else* | Start a new mission with this as the description |

> **Reset signal:** If `reset` is run while a phase is active, log a `user-signal` with `type:"reset_mid_flow"`, `role:"<current active phase's dominant role>"`, `delta:-20` **before** clearing state: `node "$MISSION_SCRIPT" user-signal '{"role":"<role>","phase":"<name>","type":"reset_mid_flow"}'`

> **End-of-mission rating:** On the final phase transition, for Low/Medium autonomy: prompt the user for a 1–5 rating (use AskUserQuestion on Claude Code; plain-text STOP on other tools), then call `node "$MISSION_SCRIPT" rate-mission '{"rating":<n>}'`. For High autonomy: call `node "$MISSION_SCRIPT" rate-mission '{"skipReason":"high_autonomy"}'`. The `phase-transition` command then prints the full Mission Scorecard and merges the run into `$XDG_CONFIG_HOME/mission/profile.json` (default: `~/.config/mission/profile.json`).

---

## Starting a New Mission

### 1. Check for Existing Mission

Read `.missions/active-mission.json`. If an active (non-completed) mission exists, inform the user and ask if they want to overwrite it. Do not proceed without confirmation.

### 1.5. Detect Host Tool

Run `node "$MISSION_SCRIPT" detect-tool` to identify the current AI coding tool. The script checks env vars in this cascade:

1. `$CLAUDECODE=1` → `claude-code`
2. any `$CODEX_*` env var → `codex`
3. `$AMP_API_KEY` or any `$AMP_*` env var → `amp`
4. any `$OPENCODE_*` env var → `opencode`
5. cached profile value (if <30 days old and matches) → use cached
6. nothing matched → `unknown`

If the result is `unknown` and `AGENTS.md` is present, use AskUserQuestion (or plain-text STOP) to ask: "Which tool are you running this mission from? codex / opencode / other". Once known, call `node "$MISSION_SCRIPT" detect-tool --confirm <tool>` to persist it in the profile.

If the result is already `claude-code`, `codex`, `amp`, or `opencode` (either from env or cache), no user prompt is needed — call `detect-tool --confirm <tool>` only if the env-detected tool differs from the cached value.

### 2. Interactive Setup

Use AskUserQuestion to gather configuration:

**If your tool doesn't have AskUserQuestion** (Codex, OpenCode, etc.): present the question and options as plain text and STOP. Wait for the user to reply with their choice before continuing. Do not pick a default and proceed.

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

Run `node "$MISSION_SCRIPT" load-model-defaults` to load the saved map for the detected tool from the profile. Then present it:

```
Host tool: <tool> (auto-detected)
Loaded defaults from $XDG_CONFIG_HOME/mission/profile.json:

  Explorer           <model>
  Planner            <model>
  Worker             <model>
  Business Reviewer  <model>
  Security Reviewer  <model>
  Edge Case Reviewer <model>
  Reviewer           <model>
  Verifier           <model>

Override any role? (reply "defaults" to accept, or "role=model" lines)
If you override: save to profile for future missions? [yes / no / this-role-only]
```

Wait for the user's reply. Then:
- Merge any overrides into the map and store in `active-mission.json` as `modelAssignment`.
- If user replied **yes**: call `node "$MISSION_SCRIPT" save-model-defaults '<full-map-json>'` to persist the full updated map.
- If user replied **this-role-only**: call `save-model-defaults` with only the overridden role(s).
- If user replied **no** or **defaults** (no overrides): skip the profile write.

> **Model IDs:** Use full, dated model IDs (e.g. `claude-haiku-4-5-20251001`, `claude-opus-4-8`, `claude-sonnet-4-6`) — not short aliases (`haiku`/`opus`/`sonnet`), which can resolve to a stale snapshot (Claude Code issue #25588). The values shown above must match `DEFAULT_MODEL_DEFAULTS["claude-code"]` in `scripts/mission-state.mjs`; keep them in sync when either changes.

> **Note:** Mechanical checks (tests, lint, TODO scan, secret detection) are now run by `scripts/mission-checks.mjs` rather than LLM agents. This saves ~25K tokens per standard mission — the verifier role focuses on reasoning over script output.

> **Optional — aggressive token modes (off by default):** for tight-budget runs the user may opt into extra Audit-phase savings by setting `optimizations: { "gateSecurityReviewer": true, "microMissionMode": true }` in `active-mission.json`. These skip/merge reviewers based on mechanical scope detection and carry real quality risk — only enable when asked, and never `gateSecurityReviewer` on a repo handling auth/PII/payments. See `references/protocol-audit-aggressive.md`. Auto-gating of the Async and Performance reviewers by scope is always on and is safe (it dispatches when uncertain).

**If your tool doesn't have AskUserQuestion** (Codex, OpenCode, etc.): present the defaults as plain text and STOP. Wait for the user to reply ("defaults" or overrides) before continuing.

**Question 6 — Test/Lint Commands (optional):**
Ask: "What commands run your tests and linter? (e.g., 'test: pytest, lint: ruff check'). Press enter to auto-detect."

If provided, store as `checks` in the state file: `{ "test": "<cmd>", "lint": "<cmd>" }`. `mission-checks.mjs` reads this first before auto-detection.

**Question 7 — Token modes (optional, default OFF):**
Ask: "Enable extra token-saving modes? Each trades some audit thoroughness for cost. Press enter to keep all off (recommended)."
- **Verifier on Haiku** — final Verify gate runs on Haiku 4.5 (it mostly reads scripted check output). Set `modelAssignment.verifier` to `"claude-haiku-4-5-20251001"`.
- **Planner on Sonnet** — spec written by Sonnet instead of Opus for tight-budget/well-scoped missions. Set `modelAssignment.planner` to `"claude-sonnet-4-6"`.
- **Gate Security reviewer by scope** — skip it when the diff touches no auth/input/IO/crypto. Set `optimizations.gateSecurityReviewer: true`.
- **Micro-mission mode** — merge Async+Perf reviewers on tiny diffs. Set `optimizations.microMissionMode: true`.
- **JSON audit synthesis** — reviewers emit JSON; a script merges/dedups findings. Set `optimizations.jsonSynthesis: true`.

Store enabled flags under `optimizations` and/or the model overrides in `active-mission.json`. **Never enable `gateSecurityReviewer` on a repo handling auth/PII/payments.** Full risk notes: `references/protocol-audit-aggressive.md`. (The Async/Perf scope-gating in the Audit phase is always on and is safe — it dispatches when uncertain.)

### 3. Read Project Instructions & Set Up Worktree

**Read the project instructions file (if present):**
Check the project root and any parent directories for a tool-specific instructions file. Read whichever is present (in priority order):
- `CLAUDE.md` — Claude Code
- `AGENTS.md` — Codex, OpenCode, and other OpenAI-compatible tools
- `amp.md` — Amp
- `.cursor/rules` — Cursor
- Any other agent config file your tool uses

This file contains project-specific instructions, conventions, and constraints that override generic behavior. Apply everything in it throughout the mission. When protocol files say "project instructions file", they mean whichever file was found here.

**Set up a git worktree (auto, skippable):**
After reading project instructions, create an isolated worktree for the mission:

```bash
node ${CLAUDE_PLUGIN_ROOT:-.}/skills/git-worktree/scripts/worktree-manager.mjs \
  create mission/<mission-slug>
```

Parse the trailing JSON line `{"worktreePath": "...", "branch": "..."}` and store
`worktreePath` in the mission state (see §4). All subsequent phase commands run with
`cwd: worktreePath`.

If the user has declined worktree isolation in their answers to Question 2
(autonomy/constraints), skip this step and operate on the current branch.

### 4. Create State File

Create the directory `.missions/` if it doesn't exist, then write `active-mission.json`:

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

Beyond `description`, `mode`, `autonomy`, `template`, `constraints`, `checks`, `modelAssignment` (above), and `phases`, the file also carries `performanceLog`, `failureLog`, `gamification`, `userSignals`, `userRating`, `paused`, `pauseHistory`, `progressLog`, `startedAt`, `completedAt`. **You don't hand-author these** — `mission-state.mjs` writes them. See **`references/state-schema.md`** for the full annotated schema.

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
2. **Check for completion marker** — scan the subagent's output for `<!-- SUBAGENT_DONE:`:
   - **Marker present** → subagent completed normally. Continue to step 3.
   - **Marker absent** → subagent hit context limit mid-task. Handle as context exhaustion (see below) — do NOT log as a failure attempt or burn retry budget.
3. Evaluate the subagent's output using `references/protocol-scoring.md`
4. Score quality (1-5), completeness (1-5), efficiency (1-5) — **omit `composite` and `verdict`; the script derives both** (composite = q×0.5 + c×0.3 + e×0.2, verdict from the band). To preview the numbers without touching state, run `mission-state.mjs score-compute '<json>'`.
5. Write specific, actionable feedback
6. Log the score: `node ~/.claude/skills/mission/scripts/mission-state.mjs score '<json>'` (or `score-batch '[...]'` for a whole phase in one call). Raw `{quality,completeness,efficiency}` is enough — no hand-computed composite required.
7. Clear the checkpoint: `node ~/.claude/skills/mission/scripts/mission-state.mjs checkpoint-clear`
8. Feed scores into the next subagent's prompt

**Note:** Each phase protocol also carries an inline scoring step (Step 1.5, Step 2.5, etc.) placed right next to the dispatch — this is immune to context compaction of SKILL.md. The `score-batch` command logs all scores for a phase in one Bash call.

#### Context Exhaustion (missing SUBAGENT_DONE marker)

```
node ~/.claude/skills/mission/scripts/mission-state.mjs checkpoint-read
```

If checkpoint exists → spawn a new subagent for the same work item, prepending:

```
RESUMING FROM CHECKPOINT — do not restart from scratch.
Already completed: [checkpoint.completedSteps]
Remaining steps:   [checkpoint.remainingSteps]
Last commit:       [checkpoint.lastCommit]
Files touched so far: [checkpoint.filesChanged]

Continue from the first remaining step only.
```

If no checkpoint → the subagent made no progress before running out of context. Treat as attempt 1 failure and follow the normal failure escalation path.

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
   - **Medium:** After every phase transition, STOP. Generate the 3-line progress summary with `node ~/.claude/skills/mission/scripts/mission-state.mjs progress-summary` (deterministic — no hand-written prose), present it, then wait. Do NOT proceed until the user replies "continue" (or "pause"). (This matches `autonomy-levels.md` — Medium is a hard pause-gate, not a soft one.)
   - **High:** Continue automatically through all phases

When the final phase completes, set `completedAt` on the mission state and present a final summary.

### Changing Models Mid-Mission

You can edit `.missions/active-mission.json` between phases to adjust any role in `modelAssignment`. The orchestrator re-reads state at every phase boundary, so the next spawned subagent will use the new value. An in-flight phase keeps the value it read at start — wait for it to finish (or pause) before editing if that matters.

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
Escalate to a **powerful debug agent** (use `modelAssignment.planner` — your most capable model) with full failure log
        ↓
Debug agent succeeds? ──yes──→  Continue to next work item
        ↓ no
Auto-generate handoff.md → Pause mission → Inform user
```

### Guards Against Infinite Loops

- **Per-work-item ceiling:** Max **3 attempts per session** + 1 powerful-model escalation. This is enforced by counting `attempts` in the `failureLog` entry for this work item.
- **Cross-session ceiling:** Max **6 total attempts** across ALL sessions for any single work item. If a handoff resumes and the same item has already been tried 6 times total, STOP — do not retry. Mark the work item as a **blocker** and ask the user: "This item has failed 6 times across sessions. Skip it (`/mission skip`), fix it manually, or abort?"
- **Autonomy override:** The failure/handoff loop **always pauses** after the debug agent fails, regardless of autonomy level. Even on High autonomy, exhausted retries force a pause. This prevents runaway loops.
- **Only the orchestrator writes state:** Subagents never write to `active-mission.json`. They return results to the orchestrator, which is the single writer. This prevents race conditions when parallel subagents run.

### How it works step by step

1. **Before dispatching**, run `node ~/.claude/skills/mission/scripts/mission-state.mjs failure-check "<work item>" --session <n>` — it returns the escalation decision so you never count attempts from memory:
   - `shouldHardStop: true` (≥6 total attempts across sessions) → HARD STOP, ask user
   - `shouldEscalate: true` (≥3 attempts this session) → skip to powerful-model escalation
   - otherwise → spawn a new subagent, feeding the returned `priorFailures` as "do NOT repeat these approaches"
2. **Orchestrator dispatches a subagent** for the work item
3. **Subagent returns** success or failure
4. **Orchestrator receives the result** and decides:
   - **Success** → log it, move to next work item
   - **Failure, attempt 1-2** → log the error and approach to `failureLog`, spawn a new subagent with instructions: "Previous attempts failed: [details]. Do NOT repeat these approaches."
   - **Failure, attempt 3** → log it, spawn a powerful debug agent (`modelAssignment.planner`) with the full failure history
   - **Debug agent succeeds** → mark `resolved: true`, continue
   - **Debug agent fails** → auto-write `handoff.md`, pause mission, inform user
5. **New session** runs `/mission` → orchestrator reads state + `handoff.md` → checks total attempt count before retrying

### What subagents know

Subagents receive:
- The work item goal, files, approach
- Previous failure details (so they don't repeat)
- Project instructions file summary and constraints

Subagents do NOT:
- Track their own attempt count
- Decide to escalate or hand off
- Write to `failureLog` or `active-mission.json` (the orchestrator does this)
- Know about other subagents or the mission state

---

## Lifecycle Commands

Each `/mission <verb>` (from the Argument Routing table) is handled below. Most are script-backed; **read `references/lifecycle-commands.md` for the full step-by-step** before executing the manual path.

| Verb | Script (preferred) | Notes |
|---|---|---|
| `status` | `mission-state.mjs status` | formatted status block |
| `log` | `mission-state.mjs log` | full timeline + phase durations |
| `pause` | `mission-state.mjs pause` | then stop all mission work |
| `resume` | `mission-state.mjs resume` | then read the active phase protocol |
| `skip` | — (manual) | confirm, mark phase skipped, advance |
| `done` | — (manual) | confirm, mark active done + rest skipped, summarize |
| `handoff` | — (manual) | write `.missions/handoff.md` (see `protocol-handoff.md`), pause |
| `reset` | — (manual) | confirm, delete state files |

All confirmation gates and the exact state mutations are in `references/lifecycle-commands.md`.

---

## Session Continuity

When `/mission` is invoked with no arguments in a new session:

1. Read `.missions/active-mission.json`
2. **Health-check the state:** run `node ~/.claude/skills/mission/scripts/mission-state.mjs doctor`. If `verdict` is not `ok`, surface the listed `issues`; on `corrupt` offer `/mission reset` and do not proceed; on `issues` fix what you can (e.g. fill a missing `modelAssignment` role) before resuming. Don't continue a structurally-broken mission silently.
3. If an active mission exists, display its status
4. Check for `.missions/handoff.md`:
   - If present, read it — this contains full context from the previous session including what was tried, what failed, and what's next
   - Delete the handoff file after reading (it's been consumed)
   - Resume the mission (set `paused: false`)
5. If the mission is not paused and not complete:
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
4. **modelAssignment complete?** For standard mode, all 8 roles must be present. For minimal, at least `explorer`, `planner`, `worker`, `verifier`. If a role is missing → fill it with the user's balanced/worker model (e.g., `"claude-sonnet-4-6"` for Claude, `"gpt-4o"` for OpenAI) as fallback and warn the user
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
  - `~/.claude/skills/mission/scripts/mission-state.mjs progress-summary [phase]` — 3-line phase-gate summary (Medium autonomy)
  - `~/.claude/skills/mission/scripts/mission-state.mjs score '<json>'` / `score-batch '[...]'` — append performance score(s); composite + verdict auto-derived from raw dimensions
  - `~/.claude/skills/mission/scripts/mission-state.mjs score-compute '<json>'` — preview composite/verdict/XP without writing state
  - `~/.claude/skills/mission/scripts/mission-state.mjs failure '<json>'` — append failure log entry
  - `~/.claude/skills/mission/scripts/mission-state.mjs failure-check "<workItem>" [--session <n>]` — escalation decision (hard-stop / escalate / retry) + prior failures
  - `~/.claude/skills/mission/scripts/mission-state.mjs parse-usage '<usage block>'` — extract {totalTokens,toolUses,durationMs} from a subagent usage block
  - `~/.claude/skills/mission/scripts/mission-state.mjs tokens` — token usage report by phase and role
  - `~/.claude/skills/mission/scripts/mission-state.mjs doctor` — validate state (required fields, one active phase, modelAssignment, phase order)
  - `~/.claude/skills/mission/scripts/mission-state.mjs get <field>` — read a field from state
  - `~/.claude/skills/mission/scripts/mission-state.mjs checkpoint-write '<json>'` — save subagent progress checkpoint
  - `~/.claude/skills/mission/scripts/mission-state.mjs checkpoint-read` — read checkpoint (returns null if none)
  - `~/.claude/skills/mission/scripts/mission-state.mjs checkpoint-clear` — delete checkpoint after successful completion
- Each protocol file in `references/` is self-contained with its own completion criteria and phase transition instructions.
- Never skip the Review/approval gate — it exists to prevent wasted implementation effort.
- If `handoff.md` exists but state file is missing, offer to reconstruct state from the handoff document or reset.
- **Template constraints and user constraints are additive.** If they conflict, template constraints take priority. Warn the user at setup if a conflict is detected.
