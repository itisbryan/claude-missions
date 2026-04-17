# Implementation Protocol

Implement the approved plan as part of an orchestrated mission.

## Rules

- **Follow the project instructions file** (`CLAUDE.md`, `AGENTS.md`, `amp.md`, etc.) — re-read before starting, it overrides generic conventions
- **Follow existing patterns** — match codebase style, naming, architecture
- **Commit incrementally** — one commit per logical unit
- **No scope creep** — implement exactly what the spec says
- **Test as you go** — write tests alongside implementation
- **Worktree** — if set up, all commits go to the mission branch

## Process

### Step 0: Load Context (compaction-safe)

Always run this step — even if you think you already know the state. Compaction may have removed earlier context.

1. Run `node scripts/mission-state.mjs status` — confirm you're in the Implement phase
2. Re-read the project instructions file (`CLAUDE.md`, `AGENTS.md`, `amp.md`, or similar) in the project root
3. Read `.claude/missions/active-mission.json` — get `modelAssignment`, `constraints`, `secondBrain`, `failureLog`, `performanceLog`
4. Review the approved plan from Architect/Review phases
5. **If `secondBrain` is set:**
   - Read `.vault-index.json` — check for notes related to the work items (prior implementations, decisions, patterns)
   - Check `code-todos.md` — any existing TODOs related to files we're about to change? Address them while we're there
   - Reference vault notes when making implementation decisions

### Step 1: Choose Execution Strategy

| Strategy | When | Model |
|----------|------|-------|
| **Inline** | 1-3 small items with dependencies | Current session model |
| **Parallel subagents** | 3+ items, non-overlapping files, no shared deps | `modelAssignment.worker` |
| **Serial subagents** | 3+ items with dependencies, fresh context each | `modelAssignment.worker` |

### Step 2: Execute

For **parallel/serial subagents**, dispatch each as a general-purpose implementation subagent with `model: <modelAssignment.worker>`:

Before dispatching each Knight (worker), fetch lessons:
```bash
LESSONS=$(node "$MISSION_SCRIPT" lessons Knight)
```
If `LESSONS` is not `[]`, prepend to that worker's prompt:
```
Lessons from prior missions (Knight has been underperforming recently):
- <lesson.text>
Keep them in mind, but focus on the work at hand.
```

**Low autonomy only:** After each work-item commit, prompt the user:
> "Work item complete: <description>. 👍 ship it, or 👎 redo? (Add a comment after 👎 if helpful)"
- Use AskUserQuestion if available (Claude Code). Otherwise print as plain text and STOP.
- 👍 → `node "$MISSION_SCRIPT" user-signal '{"role":"worker","phase":"Implement","type":"work_item_thumbs_up"}'`
- 👎 → `node "$MISSION_SCRIPT" user-signal '{"role":"worker","phase":"Implement","type":"work_item_thumbs_down","context":"<user comment>"}'`
- Skip this prompt on Medium and High autonomy.

> **Dispatch note:** Claude Code: `subagent_type: "general-purpose"`; Codex/OpenCode/Amp: use your tool's standard subagent mechanism.

```
Work item: [goal]
Files: [exact paths]
Approach: [from plan]
Verification: [how to confirm]
Project instructions summary: [one-line key conventions]
Constraints: [mission constraints]
[If resuming]: Already completed: [...]. Remaining steps: [...]. Last commit: [...]. Start from the first remaining step only.

After each logical step (file written, tests passing, commit made), save a checkpoint:
  node ~/.claude/skills/mission/scripts/mission-state.mjs checkpoint-write \
    '{"workItem":"[goal]","completedSteps":[...],"remainingSteps":[...],"lastCommit":"<sha>","filesChanged":[...]}'

When fully done, end your output with exactly:
  <!-- SUBAGENT_DONE: {"workItem":"[goal]","filesChanged":[...],"stepsCompleted":[...]} -->
```

For **inline** execution, work through items sequentially:
- Read relevant existing code
- Implement following existing patterns
- Write tests, run them, confirm passing
- Commit the logical unit

### Step 2.5 — Score worker outputs (batch)

After each worker subagent returns (skip if work was executed inline in this session):

Score each dispatched worker on 3 dimensions (1–5):
- **quality** (correctness, tests pass), **completeness** (all work-item steps done), **efficiency** (focused, minimal noise)
- composite = quality×0.5 + completeness×0.3 + efficiency×0.2
- verdict: 4.5+ outstanding · 3.5+ solid · 2.5+ needs_improvement · 1.5+ poor · else failed
- **feedback: ≤20 words, actionable**

```bash
node "$MISSION_SCRIPT" score-batch '[
  {
    "agent": "worker-1", "role": "worker", "model": "<modelAssignment.worker>",
    "phase": "Implement", "task": "<work item description>",
    "scores": {"quality":4,"completeness":4,"efficiency":3,"composite":3.8},
    "usage": {"totalTokens":0,"toolUses":0,"durationMs":0},
    "verdict": "solid",
    "feedback": "Tests pass but committed 3 files at once — split by logical unit next run."
  }
]'
```

Feed scores forward into the next worker's prompt if multiple workers ran serially.

### Step 3: Post-Implement Verification

Run the deterministic post-flight script:

    node ~/.claude/skills/mission/scripts/mission-checks.mjs post-implement --json

Scoped to files changed by `git diff --name-only`. If `verdict == "fail"`, fix blockers (or revert + report per Failure Handling). Include `todos.items` in the completion report under "Open items". If `secondBrain` is set, also run `/obsidian todo scan` to persist to vault.

### Step 4: Completion Report

```
## Phase Complete

### What was implemented
- [changes]

### Files changed
- [path]: [what and why]

### What was verified
- [test results]

### Concerns or risks
- [anything notable]
```

End the report with the completion marker so the orchestrator knows the full output was received:

```
<!-- SUBAGENT_DONE: {"workItem":"[goal]","filesChanged":[...],"stepsCompleted":[...]} -->
```

## Failure Handling

If a work item fails (tests don't pass, implementation hits a dead end, or an unresolvable error):

1. **Revert** any partial changes that would leave the codebase broken
2. **Report back** with full detail:
   - What approach was taken
   - The exact error (message, stack trace, test output)
   - What files were touched
   - Why the approach didn't work
3. Do NOT silently skip to the next work item or phase

The **orchestrator** (the `/mission` command) owns all retry and escalation decisions. See "Orchestrator Failure & Handoff Loop" in SKILL.md. Subagents just report success or failure — they don't count attempts, escalate, or trigger handoffs.

## Second Brain

If `secondBrain` is set, append to `04-implementation-log.md` as each work item completes. For significant trade-off decisions, create `decisions/decision-NNN.md`. See `references/protocol-second-brain.md`.

## Phase Transition

Follow the steps in `references/protocol-phase-transition.md`.
