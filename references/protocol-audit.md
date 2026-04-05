# Audit Protocol — Systematic Code Review

You are conducting a thorough code audit using parallel specialist reviewers.

## Severity Classification

- **P0 — Critical:** Security vulnerabilities, data loss, crashes in production. Must fix before merge.
- **P1 — High:** Logic errors, race conditions, missing error handling. Should fix before merge.
- **P2 — Medium:** Performance issues, code smells, missing edge cases. Fix if time permits.
- **P3 — Low:** Style nits, naming suggestions, minor improvements. Track for later.

## Process

### Step 1: Parallel Specialist Review

Launch **3 reviewer subagents in parallel**, each with a specific lens. Give each the list of changed files and the mission description.

**Reviewer 1 — Correctness & Safety:**
```
Review these files for mission "[description]": [list changed files]

Focus exclusively on:
- Logic errors: does the code do what the spec says?
- Null/undefined safety: unguarded access, missing checks
- Edge cases: empty inputs, boundary values, max sizes, invalid data
- Error handling: are errors caught, propagated, and surfaced correctly?
- State consistency: are mutations atomic? can state become corrupted?
- Off-by-one errors, incorrect comparisons, wrong operators

For each issue: quote the exact code, explain the bug with a concrete failure scenario, classify P0-P3, suggest the fix.
```

**Reviewer 2 — Security & Async:**
```
Review these files for mission "[description]": [list changed files]

Focus exclusively on:
- Security: injection vectors (SQL, XSS, command), input validation, auth checks, path traversal, secret exposure
- Async correctness: unawaited promises, race conditions on shared state, missing finally/cleanup blocks
- Concurrency: deadlock potential, lock ordering issues
- External calls: missing timeouts, unbounded retries, missing error handling for network failures
- Rate limiting: are public-facing endpoints protected?

For each issue: quote the exact code, explain the risk with a concrete attack/failure scenario, classify P0-P3, suggest the fix.
```

**Reviewer 3 — Performance & Architecture:**
```
Review these files for mission "[description]": [list changed files]

Focus exclusively on:
- Performance: N+1 queries, unbounded loops over large datasets, missing indexes, unnecessary re-computation
- Memory: unclosed resources, growing caches, retained closures causing leaks
- Architecture: circular dependencies, single responsibility violations, inconsistent patterns vs. rest of codebase
- Dead code: commented-out blocks, unreachable branches, unused imports
- Naming: are identifiers descriptive and consistent with the domain?

For each issue: quote the exact code, explain the performance/architecture problem, classify P0-P3, suggest the fix.
```

### Step 2: Synthesize Findings

After all 3 reviewers complete:

1. **Merge** findings by file and line — if multiple reviewers flagged the same issue, merge into one finding at the highest severity
2. **Deduplicate** — identical findings from different lenses become one
3. **Resolve contradictions** — if reviewers disagree on severity, use the higher one and note the disagreement
4. **Sort** — P0 → P1 → P2 → P3, then by file

### Step 3: Fix P0 and P1 Issues

Fix all P0 and P1 findings before proceeding. For each fix:
- Make the change
- Verify the fix addresses the issue
- Note what was changed in the audit report

## Output Format

```
## Audit Report

### P0 — Critical
1. **[Title]** (file:line)
   - Code: `[snippet]`
   - Issue: [explanation with concrete failure scenario]
   - Fix: [replacement code]
   - Reviewers: [which agents flagged this]

### P1 — High
[...]

### P2 — Medium (fix if time permits)
[...]

### P3 — Low (track for later)
[...]

### Summary
- P0: [count] fixed | P1: [count] fixed | P2: [count] noted | P3: [count] noted
- Verdict: [PASS / PASS WITH NOTES / FAIL — requires fixes]
```

## Rules

- Every finding MUST have evidence (the code snippet). No vague "this looks wrong."
- If all reviewers find zero issues, explicitly confirm what was checked and why it's clean.
- P0 and P1 findings MUST be fixed before the mission can proceed.
- Do not rubber-stamp. If the code is bad, say so clearly.

## Phase Transition

Once the audit is complete, all P0/P1 issues are fixed, and you have presented your audit report:

1. Read the mission state from `.claude/missions/active-mission.json`
2. Mark the current phase as done: set `status: "done"` and `completedAt` to current ISO timestamp
3. Set the next phase as active: set `status: "active"` and `startedAt` to current ISO timestamp
4. Add a progress log entry: `{ "timestamp": "...", "type": "phase_complete", "detail": "Audit phase complete" }`
5. Write the updated state back to the file
6. Update the current phase Task to `completed` via TaskUpdate
7. Update the next phase Task to `in_progress` via TaskUpdate
8. Read the next phase's protocol from the skill's `references/` directory
9. Continue with the new phase (respecting autonomy level — if low, pause and wait for user)
