# Audit Protocol — Systematic Code Review

Conduct a thorough code audit using 5 parallel specialist reviewers, each with a single focused lens.

## Severity

- **P0 Critical:** Security vulns, data loss, crashes. Must fix.
- **P1 High:** Logic errors, race conditions, missing error handling. Should fix.
- **P2 Medium:** Performance, code smells, missing edge cases. Fix if time permits.
- **P3 Low:** Style nits, naming, minor improvements. Track for later.

## Process

### Step 0: Load Context

1. Read `.claude/missions/active-mission.json` — get `modelAssignment`, `constraints`, `secondBrain`, and the approved plan
2. Collect the list of files changed during the Implement phase
3. **If `secondBrain` is set:**
   - Read `.vault-index.json` — find any prior decision records or architecture notes related to changed files
   - Pass relevant vault context to the Business Logic reviewer (so it can check against documented decisions, not just the current spec)
   - After audit, scan changed files for new TODO/FIXME and include count in the audit report

### Step 1: Parallel Specialist Review

Launch **5 reviewer subagents in parallel**. Pass each the changed file list, mission description, and the approved plan's validation assertions.

**Reviewer 1 — Business Logic** `(model: modelAssignment.business_reviewer)`:
```
Mission: "[description]"
Plan/spec assertions: [paste validation assertions from plan]
Changed files: [list]
Constraints: [mission constraints]

You are a business logic reviewer. Check ONLY:
- Does the implementation match every requirement in the spec? Walk through each assertion.
- Are there requirements in the spec that the code silently ignores or partially implements?
- Do conditional branches cover all business rules? (e.g., user roles, subscription tiers, feature flags)
- Are domain invariants enforced? (e.g., "balance cannot go negative", "end date must be after start date")
- Do error messages make sense to end users in business context?
- Are there implicit assumptions about data or state that contradict the spec?

For each issue: quote code, reference the spec requirement it violates, classify P0-P3, suggest fix.
```

**Reviewer 2 — Security** `(model: modelAssignment.security_reviewer)`:
```
Mission: "[description]"
Changed files: [list]

You are a security reviewer. Check ONLY:
- Injection vectors: SQL, XSS, command injection, template injection, LDAP injection
- Input validation: is all user input validated, sanitized, and escaped before use?
- Authentication: are all protected routes/endpoints gated? Can auth be bypassed?
- Authorization: can users access or modify resources they shouldn't? IDOR vulnerabilities?
- Secrets: are API keys, passwords, tokens hardcoded or logged?
- Path traversal: can user input reach file system operations?
- Crypto: weak algorithms, predictable tokens, missing CSRF protection?
- Rate limiting: are public endpoints protected from abuse?
- Data exposure: are sensitive fields (PII, passwords) filtered from logs/responses?

For each issue: quote code, explain the attack scenario step by step, classify P0-P3, suggest fix.
```

**Reviewer 3 — Edge Cases & Error Handling** `(model: modelAssignment.edge_case_reviewer)`:
```
Mission: "[description]"
Changed files: [list]

You are an edge case reviewer. Check ONLY:
- Empty/null inputs: what happens with empty strings, null, undefined, empty arrays, empty objects?
- Boundary values: zero, negative numbers, MAX_INT, very long strings, unicode, special characters
- Collection extremes: empty list, single item, very large list, duplicates
- Concurrent access: what if two requests hit the same resource simultaneously?
- Partial failures: what if step 2 of 3 fails? Is state left inconsistent?
- Missing data: what if an expected field is absent, a related record is deleted, a foreign key dangles?
- Type coercion: implicit conversions that change behavior (string "0" as falsy, float precision)
- Timeout/retry: what if an external call times out? Does retry create duplicates?
- Off-by-one: loop bounds, pagination, array slicing, date ranges (inclusive vs exclusive)

For each issue: quote code, describe the exact input that triggers the bug, classify P0-P3, suggest fix.
```

**Reviewer 4 — Async & Concurrency** `(model: modelAssignment.reviewer)`:
```
Mission: "[description]"
Changed files: [list]

You are an async/concurrency reviewer. Check ONLY:
- Unawaited promises or fire-and-forget calls without explicit intent
- Race conditions on shared state (DB records, in-memory caches, files)
- Missing cleanup in error paths (finally blocks, disposal, connection release)
- Deadlock potential from lock ordering or nested transactions
- Missing timeouts on external calls (HTTP, DB, queue)
- Unbounded retries that could cause cascading failures
- Event ordering assumptions that may not hold under load
- Transaction isolation: can concurrent transactions see inconsistent state?

For each issue: quote code, describe the timing/ordering that triggers the bug, classify P0-P3, suggest fix.
```

**Reviewer 5 — Performance & Architecture** `(model: modelAssignment.reviewer)`:
```
Mission: "[description]"
Changed files: [list]

You are a performance and architecture reviewer. Check ONLY:
- N+1 queries or unbounded loops over large datasets
- Missing database indexes for new query patterns
- Unnecessary re-computation or re-rendering
- Memory: unclosed resources, growing caches, retained closures
- Large payloads: missing pagination, streaming, or lazy loading
- Architecture: circular dependencies, SRP violations, inconsistent patterns vs. codebase
- Dead code: unreachable branches, unused imports, commented-out blocks

For each issue: quote code, explain the performance/architecture impact, classify P0-P3, suggest fix.
```

### Step 2: Synthesize

1. **Merge** — same file+line flagged by multiple reviewers → one finding at highest severity
2. **Deduplicate** — identical findings become one
3. **Cross-reference** — if business logic reviewer says "spec requires X" and edge case reviewer says "X fails on empty input", link them as one compound finding
4. **Resolve contradictions** — use higher severity, note disagreement
5. **Sort** — P0 → P1 → P2 → P3, then by file

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

### Coverage Matrix
| Reviewer | Findings | P0 | P1 | P2 | P3 |
|---|---|---|---|---|---|
| Business Logic | n | n | n | n | n |
| Security | n | n | n | n | n |
| Edge Cases | n | n | n | n | n |
| Async & Concurrency | n | n | n | n | n |
| Performance & Architecture | n | n | n | n | n |

### Summary
- P0: [n] fixed | P1: [n] fixed | P2: [n] noted | P3: [n] noted
- Verdict: [PASS / PASS WITH NOTES / FAIL]
```

## Rules

- Every finding MUST have evidence (code snippet). No vague claims.
- If zero issues found, confirm what was checked and why it's clean.
- P0/P1 MUST be fixed before proceeding.

## Second Brain

If `secondBrain` is set, write `06-audit-report.md` with all findings, severity, and the coverage matrix. See `references/protocol-second-brain.md`.

## Phase Transition

Follow the steps in `references/protocol-phase-transition.md`.
