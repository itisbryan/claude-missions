# Testing Protocol

You are writing and running tests for all new/changed code.

## Test Strategy

1. **Unit tests first** — test individual functions and methods in isolation
2. **Integration tests** — test module interactions and data flow
3. **Edge cases** — empty inputs, boundary values, max sizes, invalid data
4. **Error paths** — ensure errors are caught, logged, and surfaced correctly
5. **Regression** — if fixing a bug, write a test that reproduces it first

## Rules

- Every public function/method must have at least one test
- Cover the happy path AND at least two edge cases per function
- Tests must be deterministic — no flaky tests, no timing dependencies
- Use the project's existing test framework and patterns
- Run the full test suite after writing new tests — ensure nothing is broken

## Running Tests

After writing tests, run:

    node ~/.claude/skills/mission/scripts/mission-checks.mjs pre-checks --skip lint,todos --json

Read `tests.passed` / `tests.failed`. If failures, fix them before reporting.

## Output

After testing is complete:

1. Report total tests, passed, failed, and coverage if available
2. List any areas with insufficient coverage
3. Confirm: "All tests passing. Test phase complete."

## Second Brain

If `secondBrain` is set, write `05-test-report.md` with test results, coverage, and gaps. See `references/protocol-second-brain.md`.

## Phase Transition

Once all tests pass and you have presented your test report, follow the steps in `references/protocol-phase-transition.md`.
