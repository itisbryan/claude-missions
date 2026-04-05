# Build Protocol — Implement + Test (Minimal Mode)

You are in the **BUILD** phase of a minimal mission. This phase combines implementation and testing — you implement each work item and test it before moving on.

## Rules

- **Follow CLAUDE.md.** Re-read it before starting — it overrides generic conventions.
- **Follow existing patterns.** Match the codebase's style, naming, and architecture.
- **Commit incrementally.** Each logical unit of change gets its own commit.
- **No scope creep.** Implement exactly what the plan says.
- **Test as you go.** Write tests alongside each work item, not at the end.
- **You are in a git worktree** (if one was set up during mission start). All commits go to the mission branch.

## Process

Re-read `CLAUDE.md` in the project root before starting. Then, for each work item from the plan:

1. Read the relevant existing code
2. Implement following existing patterns
3. Write tests for the new/changed behavior:
   - Unit test for the core logic
   - At minimum one edge case per function
   - Error path test if applicable
4. Run tests — confirm they pass
5. Commit the work item

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

If you cannot complete a work item:

1. Document what you tried and why it failed
2. Revert any partial changes that would break the codebase
3. Report the failure with diagnostic detail
4. Do NOT silently skip or move to Verify

## Phase Transition

Once all work items are implemented, tested, and you have presented the completion report:

1. Read the mission state from `.claude/missions/active-mission.json`
2. Mark the current phase as done: set `status: "done"` and `completedAt` to current ISO timestamp
3. Set the next phase as active: set `status: "active"` and `startedAt` to current ISO timestamp
4. Add a progress log entry: `{ "timestamp": "...", "type": "phase_complete", "detail": "Build phase complete" }`
5. Write the updated state back to the file
6. Update the current phase Task to `completed` via TaskUpdate
7. Update the next phase Task to `in_progress` via TaskUpdate
8. Read `references/protocol-verification.md`
9. Continue with the Verify phase (respecting autonomy level)
