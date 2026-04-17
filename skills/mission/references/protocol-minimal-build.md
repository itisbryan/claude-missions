# Build Protocol — Implement + Test (Minimal Mode)

You are in the **BUILD** phase of a minimal mission. This phase combines implementation and testing — you implement each work item and test it before moving on.

## Rules

- **Follow the project instructions file** (`CLAUDE.md`, `AGENTS.md`, `amp.md`, etc.). Re-read it before starting — it overrides generic conventions.
- **Follow existing patterns.** Match the codebase's style, naming, and architecture.
- **Commit incrementally.** Each logical unit of change gets its own commit.
- **No scope creep.** Implement exactly what the plan says.
- **Test as you go.** Write tests alongside each work item, not at the end.
- **You are in a git worktree** (if one was set up during mission start). All commits go to the mission branch.

## Process

**Step 0 — Load Context (compaction-safe).** Always run first:
1. Run `node scripts/mission-state.mjs status` — confirm you're in the Build phase
2. Re-read the project instructions file (`CLAUDE.md`, `AGENTS.md`, `amp.md`, or similar) in the project root
3. Read `.claude/missions/active-mission.json` — get `modelAssignment`, `constraints`, `secondBrain`, `failureLog`
4. If 3+ independent work items, dispatch parallel subagents with `model: modelAssignment.worker`

Before dispatching each Knight (worker), fetch lessons:
```bash
LESSONS=$(node "$MISSION_SCRIPT" lessons Knight)
```
If `LESSONS` is not `[]`, prepend to the worker's prompt:
```
Lessons from prior missions (Knight has been underperforming recently):
- <lesson.text>
Keep them in mind, but focus on the work at hand.
```

For each work item from the plan:

1. Read the relevant existing code
2. Implement following existing patterns
3. Write tests for the new/changed behavior:
   - Unit test for the core logic
   - At minimum one edge case per function
   - Error path test if applicable
4. Run tests — confirm they pass
5. Commit the work item

### Score worker outputs

After each dispatched worker subagent returns (skip if work was executed inline):

```bash
node "$MISSION_SCRIPT" score-batch '[
  {
    "agent": "worker-1", "role": "worker", "model": "<modelAssignment.worker>",
    "phase": "Build", "task": "<work item description>",
    "scores": {"quality":4,"completeness":4,"efficiency":4,"composite":4.0},
    "usage": {"totalTokens":0,"toolUses":0,"durationMs":0},
    "verdict": "solid",
    "feedback": "Clean implementation; add test for the error path next run."
  }
]'
```

**Low autonomy only:** After each work-item commit, prompt the user:
> "Work item complete: <description>. 👍 ship it, or 👎 redo? (Add a comment after 👎 if helpful)"
- Use AskUserQuestion if available (Claude Code). Otherwise print as plain text and STOP.
- 👍 → `node "$MISSION_SCRIPT" user-signal '{"role":"worker","phase":"Build","type":"work_item_thumbs_up"}'`
- 👎 → `node "$MISSION_SCRIPT" user-signal '{"role":"worker","phase":"Build","type":"work_item_thumbs_down","context":"<user comment>"}'`
- Skip on Medium and High autonomy.

### Bug Fix Mode

If the template is `bugfix`:
1. Write the failing regression test **first** (confirm it fails)
2. Apply the fix
3. Confirm the test now passes
4. Run the full test suite to confirm no regressions

### Refactor Mode

If the template is `refactor`:
1. Run the existing test suite — save output as baseline
2. Refactor one module at a time
3. Run tests after each module — output must match baseline
4. Do NOT add new functionality

## Completion Report

When all work items are done, report:

```
## Build Phase Complete

### What was implemented
- [bullet list of concrete changes]

### Files changed
- [path]: [what changed and why]

### Test results
- [X] tests passing, [Y] new tests added
- Coverage: [if available]

### Concerns or risks
- [anything worth noting]
```

## Failure Handling

If a work item fails:

1. **Revert** any partial changes that would break the codebase
2. **Report back** with the exact error, approach taken, and files touched
3. Do NOT silently skip or move to Verify

The **orchestrator** owns all retry and escalation decisions — see "Orchestrator Failure & Handoff Loop" in SKILL.md.

## Second Brain

If `secondBrain` is set, write `04-implementation-log.md` with what was built and test results. For significant decisions, create `decisions/decision-NNN.md`. See `references/protocol-second-brain.md`.

## Phase Transition

Once all work items are implemented and tested, follow the steps in `references/protocol-phase-transition.md`.
