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

### Step 0: Load Context (compaction-safe)

Always run this step — even if you think you already know the state. Compaction may have removed earlier context.

1. Run `node scripts/mission-state.mjs status` — confirm you're in the Implement phase
2. Re-read `CLAUDE.md` in the project root
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

### Step 3: TODO Scan

After all work items are implemented, scan the changed files for leftover `TODO:`, `FIXME:`, `HACK:`, `XXX:` comments. These are often left during implementation and should be tracked.

1. Run `git diff --name-only` to get changed files
2. Grep those files for TODO/FIXME/HACK/XXX patterns
3. Include any findings in the completion report under "Open items"
4. If `secondBrain` is set, run `/obsidian todo scan` to save them to the vault

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
