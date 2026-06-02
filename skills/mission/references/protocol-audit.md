# Audit Protocol — Systematic Code Review

Conduct a thorough code audit using 5 parallel specialist reviewers, each with a single focused lens.

## Severity

- **P0 Critical:** Security vulns, data loss, crashes. Must fix.
- **P1 High:** Logic errors, race conditions, missing error handling. Should fix.
- **P2 Medium:** Performance, code smells, missing edge cases. Fix if time permits.
- **P3 Low:** Style nits, naming, minor improvements. Track for later.

## Process

### Step 0: Load Context (compaction-safe)

Always run this step first. Compaction may have removed earlier context.

1. Run `node scripts/mission-state.mjs status` — confirm you're in the Audit phase
2. Read `.missions/active-mission.json` — get `modelAssignment`, `constraints`, and the approved plan
3. Collect the list of files changed during the Implement phase

### Step 0.5: Mechanical Pre-Filter & Scope Gating

Run the pattern detector before spawning reviewers:

    node ~/.claude/skills/mission/scripts/mission-checks.mjs audit-prefilter --json

The output has two parts:

1. **`findings`** — pre-detected issues (hardcoded secrets, debugger statements, eval, console.log). Pass the `findings` array verbatim into each reviewer's prompt under a section titled "Pre-detected mechanical findings — do NOT re-detect these, but you may dispute or downgrade them".
2. **`scope` / `size` / `dispatch` / `gating`** — a conservative scan of the changed files. `dispatch` tells you which reviewers are in scope (booleans for `async_concurrency` and `performance_arch`; `business_logic`, `security`, `edge_cases` are always `true` by default). The detector **biases toward over-dispatching** — when it can't tell (no files scanned, unknown diff size), every gate returns `true`. A skipped reviewer simply produces no score entry, which is gamification-safe (the streak only resets if a scoring *phase* logs zero scores, not an individual reviewer).

### Step 1: Parallel Specialist Review

Launch the **in-scope read-only reviewer subagents in parallel** (up to 5). Use the prefilter's `dispatch` map from Step 0.5 to decide:
- **Reviewer 1 (Business Logic)**, **Reviewer 2 (Security)**, **Reviewer 3 (Edge Cases)** — always dispatch (default). (Reviewer 2 can be gated only under the aggressive opt-in in `references/protocol-audit-aggressive.md`.)
- **Reviewer 4 (Async & Concurrency)** — dispatch only if `dispatch.async_concurrency` is `true`.
- **Reviewer 5 (Performance & Architecture)** — dispatch only if `dispatch.performance_arch` is `true`.

When in doubt, dispatch — the cost of an unneeded reviewer is small; the cost of a missed bug is not. Pass each reviewer the changed file list, mission description, and the approved plan's validation assertions.

> **Opt-in token modes:** if `optimizations.gateSecurityReviewer`, `optimizations.microMissionMode`, or `optimizations.jsonSynthesis` is set in state, also apply `references/protocol-audit-aggressive.md` (Security gating / micro-mission consolidation / deterministic JSON synthesis via `mission-checks.mjs audit-synthesis`). All are **off** unless explicitly enabled — default behavior dispatches the full default panel and synthesizes findings inline.

> **Dispatch note:** Use your tool's read-only/exploration subagent mechanism for all reviewers. Claude Code: `subagent_type: "Explore"`; Codex/OpenCode/Amp: use equivalent read-only agent mode. Pass the role-specific model from `modelAssignment`.

Before dispatching each reviewer, fetch its class lessons and (if non-empty) prepend them — see `references/protocol-lessons-fetch.md` for the prepend format. Classes: Reviewer-1 `lessons Cleric` · Reviewer-2 `lessons Rogue` · Reviewer-3 `lessons Ranger` · Reviewers 4–5 `lessons Druid`.

**Reviewer 1 — Business Logic**
Dispatch with `model: <modelAssignment.business_reviewer>`.
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

Pre-detected mechanical findings (already logged, do not re-report unless disputing severity): [paste prefilter JSON.findings]
```

**Reviewer 2 — Security**
Dispatch with `model: <modelAssignment.security_reviewer>`.
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

Pre-detected mechanical findings (already logged, do not re-report unless disputing severity): [paste prefilter JSON.findings]
```

**Reviewer 3 — Edge Cases & Error Handling**
Dispatch with `model: <modelAssignment.edge_case_reviewer>`.
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

Pre-detected mechanical findings (already logged, do not re-report unless disputing severity): [paste prefilter JSON.findings]
```

**Reviewer 4 — Async & Concurrency** *(dispatch only if `dispatch.async_concurrency` is true)*
Dispatch with `model: <modelAssignment.reviewer>`.
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

Pre-detected mechanical findings (already logged, do not re-report unless disputing severity): [paste prefilter JSON.findings]
```

**Reviewer 5 — Performance & Architecture** *(dispatch only if `dispatch.performance_arch` is true)*
Dispatch with `model: <modelAssignment.reviewer>`.
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

Pre-detected mechanical findings (already logged, do not re-report unless disputing severity): [paste prefilter JSON.findings]
```

### Step 1.5 — Score reviewer outputs (batch)

After all reviewer subagents return, score each on 3 dimensions (1–5). **Only include score entries for reviewers you actually dispatched** — drop the JSON objects for any reviewer skipped by scope gating (the example below shows all 5; trim to match). You may pass raw `{quality,completeness,efficiency}` and let the script derive `composite`/`verdict`:
- **quality** (findings accuracy/depth), **completeness** (coverage of their lens), **efficiency** (signal-to-noise ratio)
- composite = quality×0.5 + completeness×0.3 + efficiency×0.2
- verdict: 4.5+ outstanding · 3.5+ solid · 2.5+ needs_improvement · 1.5+ poor · else failed
- **feedback: ≤20 words, actionable**

```bash
node "$MISSION_SCRIPT" score-batch '[
  {"agent":"reviewer-1","role":"business_reviewer","model":"<modelAssignment.business_reviewer>","phase":"Audit","task":"Business Logic review","scores":{"quality":4,"completeness":4,"efficiency":4,"composite":4.0},"usage":{"totalTokens":0,"toolUses":0,"durationMs":0},"verdict":"solid","feedback":"Good spec alignment check; missed the pagination edge case."},
  {"agent":"reviewer-2","role":"security_reviewer","model":"<modelAssignment.security_reviewer>","phase":"Audit","task":"Security review","scores":{"quality":5,"completeness":4,"efficiency":5,"composite":4.7},"usage":{"totalTokens":0,"toolUses":0,"durationMs":0},"verdict":"outstanding","feedback":"Found the SQL injection path and the missing auth check."},
  {"agent":"reviewer-3","role":"edge_case_reviewer","model":"<modelAssignment.edge_case_reviewer>","phase":"Audit","task":"Edge Cases review","scores":{"quality":3,"completeness":3,"efficiency":4,"composite":3.2},"usage":{"totalTokens":0,"toolUses":0,"durationMs":0},"verdict":"needs_improvement","feedback":"Null inputs not tested — add boundary checks to next audit prompt."},
  {"agent":"reviewer-4","role":"reviewer","model":"<modelAssignment.reviewer>","phase":"Audit","task":"Async & Concurrency review","scores":{"quality":4,"completeness":4,"efficiency":3,"composite":3.8},"usage":{"totalTokens":0,"toolUses":0,"durationMs":0},"verdict":"solid","feedback":"Race condition found; verbose output — trim next run."},
  {"agent":"reviewer-5","role":"reviewer","model":"<modelAssignment.reviewer>","phase":"Audit","task":"Performance & Architecture review","scores":{"quality":4,"completeness":3,"efficiency":4,"composite":3.7},"usage":{"totalTokens":0,"toolUses":0,"durationMs":0},"verdict":"solid","feedback":"Good architectural observations; missed the N+1 query."}
]'
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

**User signal hooks at this boundary:**
- If the user disputes a P0/P1 finding and requests downgrade (per dispute): `node "$MISSION_SCRIPT" user-signal '{"role":"<reviewer role that raised it>","phase":"Audit","type":"dispute_finding","context":"<brief description>"}'`
- If the user accepts the audit verdict as-is: `node "$MISSION_SCRIPT" user-signal '{"role":"reviewer","phase":"Audit","type":"audit_approved"}'` (distribute across reviewer roles used this phase by running it once per reviewer role)

## Rules

- Every finding MUST have evidence (code snippet). No vague claims.
- If zero issues found, confirm what was checked and why it's clean.
- P0/P1 MUST be fixed before proceeding.

## Phase Transition

Follow the steps in `references/protocol-phase-transition.md`.
