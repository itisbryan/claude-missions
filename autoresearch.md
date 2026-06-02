# Autoresearch: harden the mission skill (guardrails, validation, security)

## Objective
Make `skills/mission/scripts/mission-state.mjs` and `mission-checks.mjs` strict and secure: graceful handling of malformed/malicious input, bounded values, no shell injection, no prototype pollution — without regressing existing behavior (scoring math, gating, atomic writes).

## Metrics
- **Primary**: `guardrails_passed` (count, higher is better) — number of guardrail assertions that hold.
- **Secondary**: `failures` (lower is better), `guardrails_total` (context).

## How to Run
`./autoresearch.sh` — pre-checks syntax, runs `autoresearch_harness.mjs`, prints `METRIC name=value`.
Correctness gate: `./autoresearch.checks.sh` (scoring math, gating, parse).

## Files in Scope
- `skills/mission/scripts/mission-state.mjs` — state ops / scoring / model defaults CLI.
- `skills/mission/scripts/mission-checks.mjs` — tests/lint/TODO + audit-prefilter/scope gating.
- Mission protocol `.md` files — guardrail wording only.
- `autoresearch_harness.mjs` — may add guardrails (never weaken to game the metric).

## Off Limits
- The standalone `/obsidian` skill. The gamification XP/verdict contract (composite=q·.5+c·.3+e·.2, bands, XP formula) — must not change (checks enforce).

## Constraints
- `./autoresearch.checks.sh` must pass (no scoring/gating regression).
- Zero new runtime dependencies (scripts are zero-dep).
- Cross-tool safe (no Claude-only assumptions).

## Termination
Fixed count (~15 experiments) OR earlier if guardrails_passed == guardrails_total for 2 consecutive experiments (set exhausted). Scope: scripts + protocol wording.

## What's Been Tried

Baseline 4/14 → **14/14** (5.0× confidence), 3 hardening keeps, 0 discards.

- **#2 keep (4→10):** `parseArg()` helper in mission-state.mjs — malformed JSON args now exit gracefully (no stack trace) and prototype-pollution keys (`__proto__`/`constructor`/`prototype`) are stripped before merge/persist. Applied to score/user-signal/failure/rate-mission/checkpoint-write/save-model-defaults.
- **#3 keep (10→12):** `compositeOf` clamps quality/completeness/efficiency to [1,5], so out-of-range dims can't push composite/verdict/XP out of bounds.
- **#4 keep (12→14):** **security** — `getChangedFiles`/`getDiffStat` switched from `execSync(\`git diff … ${ref}\`)` to `spawnSync('git', [...args])` argv arrays. Attacker-controlled refs (state `startCommit`, `--since`) can no longer inject shell commands.

**Stopped at 14/14:** guardrail surface exhausted; the gamification XP/verdict contract was preserved throughout (checks.sh green every experiment). Remaining hardening ideas (DoS bounds on huge batches, `which`-command audit) deemed low-value vs. the covered injection/validation/bounds surface.
