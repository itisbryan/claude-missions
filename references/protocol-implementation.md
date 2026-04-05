# Implementation Protocol

You are implementing work as part of an orchestrated mission. Follow this protocol exactly.

## Implementation Rules

- **Follow CLAUDE.md.** Re-read it before starting — it overrides generic conventions.
- **Follow existing patterns.** Match the codebase's style, naming, and architecture.
- **Commit incrementally.** Each logical unit of change gets its own commit.
- **No scope creep.** Implement exactly what the spec says. If you spot improvements, note them but don't add them.
- **Test as you go.** Write tests alongside implementation, not as an afterthought.
- **You are in a git worktree** (if one was set up during mission start). All commits go to the mission branch — do not touch the default branch.

## Process

1. Re-read `CLAUDE.md` in the project root — honor all conventions, tooling preferences, and constraints.
2. Review the approved plan from the Architect/Review phases.
3. Assess the work items and choose an execution strategy:

   | Strategy | When to use |
   |----------|-------------|
   | **Inline** | 1-3 small items with dependencies between them |
   | **Parallel subagents** | 3+ items that touch non-overlapping files with no shared dependencies |
   | **Serial subagents** | 3+ items with dependencies; each agent gets fresh context for one unit |

   For **parallel subagents**, give each agent:
   - The plan (or the specific work item's goal, files, approach, verification)
   - The CLAUDE.md contents
   - The worktree path (so they commit to the right branch)
   - Instruction: "implement only this work item, run tests, commit"

4. Execute — for each work item (inline or via subagent):
   - Read the relevant existing code first
   - Implement following existing patterns
   - Write tests for the new code
   - Run tests to confirm they pass
   - Commit the logical unit

## Completion Report

When all work is done, report:

```
## Phase Complete

### What was implemented
- [bullet list of concrete changes]

### Files changed
- [path]: [what changed and why]

### What was verified
- [test results, manual checks]

### Concerns or risks
- [anything the reviewer should pay attention to]
```

## Failure Handling

If you cannot complete the current work:

1. Document what you tried and why it failed
2. Revert any partial changes that would leave the codebase in a broken state
3. Report the failure with as much diagnostic detail as possible
4. Do NOT silently skip or move to the next phase

## Phase Transition

Once all implementation work is complete and you have presented your completion report:

1. Read the mission state from `.claude/missions/active-mission.json`
2. Mark the current phase as done: set `status: "done"` and `completedAt` to current ISO timestamp
3. Set the next phase as active: set `status: "active"` and `startedAt` to current ISO timestamp
4. Add a progress log entry: `{ "timestamp": "...", "type": "phase_complete", "detail": "Implement phase complete" }`
5. Write the updated state back to the file
6. Update the current phase Task to `completed` via TaskUpdate
7. Update the next phase Task to `in_progress` via TaskUpdate
8. Read the next phase's protocol from the skill's `references/` directory
9. Continue with the new phase (respecting autonomy level — if low, pause and wait for user)
