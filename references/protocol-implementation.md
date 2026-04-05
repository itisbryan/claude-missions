# Implementation Protocol

Implement the approved plan as part of an orchestrated mission.

## Rules

- **Follow CLAUDE.md** — re-read before starting, it overrides generic conventions
- **Follow existing patterns** — match codebase style, naming, architecture
- **Commit incrementally** — one commit per logical unit
- **No scope creep** — implement exactly what the spec says
- **Test as you go** — write tests alongside implementation
- **Worktree** — if set up, all commits go to the mission branch

## Process

### Step 0: Load Context

1. Re-read `CLAUDE.md` in the project root
2. Read `.claude/missions/active-mission.json` — get `modelAssignment` and `constraints`
3. Review the approved plan from Architect/Review phases

### Step 1: Choose Execution Strategy

| Strategy | When | Model |
|----------|------|-------|
| **Inline** | 1-3 small items with dependencies | Current session model |
| **Parallel subagents** | 3+ items, non-overlapping files, no shared deps | `modelAssignment.worker` |
| **Serial subagents** | 3+ items with dependencies, fresh context each | `modelAssignment.worker` |

### Step 2: Execute

For **parallel/serial subagents**, dispatch each with `model: modelAssignment.worker`:
```
Work item: [goal]
Files: [exact paths]
Approach: [from plan]
Verification: [how to confirm]
CLAUDE.md summary: [one-line key conventions]
Constraints: [mission constraints]

Implement this work item only. Follow existing patterns. Write tests. Run tests. Commit when passing.
```

For **inline** execution, work through items sequentially:
- Read relevant existing code
- Implement following existing patterns
- Write tests, run them, confirm passing
- Commit the logical unit

### Step 3: Completion Report

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

## Failure Handling

1. Document what was tried and why it failed
2. Revert partial changes that would break the codebase
3. Report with diagnostic detail
4. Do NOT silently skip to the next phase

## Phase Transition

Follow the steps in `references/protocol-phase-transition.md`.
