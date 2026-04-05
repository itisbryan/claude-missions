# Mission Templates

Pre-configured mission presets that tune the phase set, autonomy, and phase-specific guidance for common development patterns.

## How Templates Work

When a user selects a template during mission setup, it:
1. Pre-selects the mode (standard or minimal)
2. Sets a recommended autonomy level
3. Adds template-specific constraints to the mission description
4. Customizes phase instructions for the context

---

## Template: Feature

**Use when:** Adding new user-facing functionality, APIs, or capabilities.

- **Mode:** Standard (6 phases)
- **Autonomy:** Medium
- **Key constraints:**
  - Architect phase must identify all affected API contracts and UI surfaces
  - Implementation must not break existing behavior (add, don't replace)
  - Tests must cover the new happy path AND regression for existing paths
  - Audit pays extra attention to API backward compatibility and auth checks

**Phase emphasis:**
- Architect: identify exact integration points with existing code
- Review: confirm no unintended scope in the implementation plan
- Implement: new code alongside old; no silent removals
- Test: regression suite runs clean; new feature has full coverage
- Audit: backward compatibility, input validation, auth on new endpoints
- Verify: exercise the feature end-to-end through the real surface

---

## Template: Bug Fix

**Use when:** Diagnosing and correcting defective behavior.

- **Mode:** Minimal (3 phases)
- **Autonomy:** Low (confirm the diagnosis before fixing)
- **Key constraints:**
  - Plan phase must reproduce the bug and identify the root cause before proposing a fix
  - Fix must be minimal — change only what is necessary to correct the defect
  - Write a regression test that would have caught the bug
  - Do not refactor surrounding code as part of the fix

**Phase emphasis:**
- Plan: reproduce bug → identify root cause → propose minimal fix → get approval
- Build: apply fix, write regression test, confirm fix resolves issue
- Verify: regression test passes; existing tests still pass; confirm original symptom is gone

**Special instruction for Plan phase:**
Before proposing a fix, demonstrate the bug:
1. Write a failing test that reproduces the reported behavior
2. Confirm the test fails on the current code
3. Then propose the fix
4. This "test-first" approach confirms you've found the right root cause

---

## Template: Refactor

**Use when:** Restructuring existing code for clarity, performance, or maintainability — without changing observable behavior.

- **Mode:** Standard (6 phases)
- **Autonomy:** Medium
- **Key constraints:**
  - Behavior must be identical before and after — no functional changes
  - Architect phase must document the current behavior as a contract that the refactor must preserve
  - Tests must pass before AND after; do not add new tests that didn't exist before (unless they capture currently untested behavior)
  - Audit is the most important phase: verify no accidental behavioral changes

**Phase emphasis:**
- Architect: document current behavior, identify refactor scope, define "done" as "all tests pass and behavior is identical"
- Review: confirm scope is bounded — reject if plan includes any functional changes
- Implement: incremental — refactor one module/class/function at a time, run tests after each
- Test: characterization tests first (capture current behavior), then refactor, then verify tests still pass
- Audit: diff-level review looking for accidental behavioral changes disguised as style changes
- Verify: full test suite passes; performance benchmarks within acceptable bounds

---

## Template: Investigation / Spike

**Use when:** Exploring an unknown area, researching a technology, or answering a technical question before committing to a solution.

- **Mode:** Minimal (3 phases, renamed)
- **Autonomy:** High
- **Key constraints:**
  - Output is a written report, not production code
  - No code should be merged as part of this mission
  - The investigation should answer specific questions defined in the Plan phase

**Phase emphasis:**
- Plan: define the specific questions this investigation must answer; set success criteria
- Build: read code, run experiments, write throwaway code to test hypotheses; document findings
- Verify: does the output answer all questions from the Plan? present findings as a structured report

---

## Selecting a Template

When the user starts a new mission, after choosing mode, offer templates:

```
Which template fits your mission?
- Feature — adding new functionality
- Bug Fix — diagnosing and correcting a defect
- Refactor — restructuring without behavioral change
- Investigation — exploring an unknown area
- Custom — no template, standard phases
```

If the user selects a template, apply its constraints to the mission state:
```json
{
  "template": "bugfix",
  "constraints": "Fix must be minimal. Write regression test first. Do not refactor."
}
```

These constraints are included in every phase protocol prompt for the duration of the mission.
