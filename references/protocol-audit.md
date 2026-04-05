# Audit Protocol — Systematic Code Review

Conduct a thorough code audit using parallel specialist reviewers.

## Severity

- **P0 Critical:** Security vulns, data loss, crashes. Must fix.
- **P1 High:** Logic errors, race conditions, missing error handling. Should fix.
- **P2 Medium:** Performance, code smells, missing edge cases. Fix if time permits.
- **P3 Low:** Style nits, naming, minor improvements. Track for later.

## Process

### Step 0: Load Context

1. Read `.claude/missions/active-mission.json` — get `modelAssignment` and `constraints`
2. Collect the list of files changed during the Implement phase

### Step 1: Parallel Specialist Review

Launch **3 reviewer subagents in parallel** using `model: modelAssignment.reviewer`. Pass only the changed file list and mission description — not the full plan.

**Reviewer 1 — Correctness & Safety** `(model: modelAssignment.reviewer)`:
```
Mission: "[description]"
Changed files: [list]

Check: logic correctness vs spec, null/undefined safety, edge cases (empty/boundary/max), error handling, state consistency, off-by-one errors.
For each issue: quote code, explain bug with failure scenario, classify P0-P3, suggest fix.
```

**Reviewer 2 — Security & Async** `(model: modelAssignment.reviewer)`:
```
Mission: "[description]"
Changed files: [list]

Check: injection vectors (SQL/XSS/command), input validation, auth checks, path traversal, secret exposure, unawaited promises, race conditions, missing cleanup/finally, missing timeouts, rate limiting.
For each issue: quote code, explain risk with attack/failure scenario, classify P0-P3, suggest fix.
```

**Reviewer 3 — Performance & Architecture** `(model: modelAssignment.reviewer)`:
```
Mission: "[description]"
Changed files: [list]

Check: N+1 queries, unbounded loops, missing indexes, memory leaks, unclosed resources, circular deps, SRP violations, inconsistent patterns, dead code, naming.
For each issue: quote code, explain problem, classify P0-P3, suggest fix.
```

### Step 2: Synthesize

1. **Merge** — same file+line flagged by multiple reviewers → one finding at highest severity
2. **Deduplicate** — identical findings become one
3. **Resolve contradictions** — use higher severity, note disagreement
4. **Sort** — P0 → P1 → P2 → P3, then by file

### Step 3: Fix P0 and P1

Fix all P0/P1 findings. For each: make the change, verify it, note in report.

## Output

```
## Audit Report

### P0 — Critical
1. **[Title]** (file:line)
   - Code: `[snippet]`
   - Issue: [failure scenario]
   - Fix: [code]
   - Flagged by: [which reviewers]

### P1 — High
[...]

### P2 — Medium (noted)
[...]

### P3 — Low (noted)
[...]

### Summary
- P0: [n] fixed | P1: [n] fixed | P2: [n] noted | P3: [n] noted
- Verdict: [PASS / PASS WITH NOTES / FAIL]
```

## Rules

- Every finding MUST have evidence (code snippet). No vague claims.
- If zero issues found, confirm what was checked and why it's clean.
- P0/P1 MUST be fixed before proceeding.

## Phase Transition

Follow the steps in `references/protocol-phase-transition.md`.
