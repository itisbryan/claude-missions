# Changelog

All notable changes to claude-missions are documented here.

---

## [Unreleased]

### Added — Subagent Context-Exhaustion Handling

Workers that hit their context limit mid-task now hand off cleanly instead of losing all progress.

**How it works:**
- Workers call `checkpoint-write` after each logical step (file written, tests passing, commit made), saving `completedSteps`, `remainingSteps`, `lastCommit`, and `filesChanged` to `.claude/missions/subagent-checkpoint.json`
- Workers end their output with `<!-- SUBAGENT_DONE: {...} -->` — the orchestrator uses the presence/absence of this marker to distinguish context exhaustion from a real failure
- On missing marker: orchestrator reads the checkpoint and spawns a new subagent with a `RESUMING FROM CHECKPOINT` prefix, skipping already-completed steps. The retry budget is **not** consumed
- On success: orchestrator calls `checkpoint-clear` before moving to the next work item

**Three new `mission-state.mjs` subcommands:**
- `checkpoint-write '<json>'` — atomically saves progress; creates `.claude/missions/` if needed
- `checkpoint-read` — outputs the checkpoint JSON, or `null` if none exists
- `checkpoint-clear` — deletes the checkpoint file after successful work item completion

### Added — Mechanical Checks Script

New zero-dependency script `skills/mission/scripts/mission-checks.mjs` replaces token-burning LLM pattern scans with deterministic shell operations. Estimated savings: ~25K tokens per standard mission, 1–2s vs 30–60s per check.

**Three subcommands:**

- `pre-checks` — runs tests + lint + TODO scan over the whole project; used by Verify phase
- `post-implement` — same checks scoped to git-changed files; replaces manual TODO grep in Implement phase
- `audit-prefilter` — pattern-detects hardcoded secrets, debugger statements, eval, console.log across changed files; pre-populates Audit reviewer prompts

**Test/lint discovery order:** `active-mission.json.checks` → `package.json` scripts → common binary fallbacks (pytest, cargo test, go test, eslint, ruff, etc.)

**New `--print-config` flag** to inspect discovered commands before running.

**New `checks` field in `active-mission.json`** for explicit command override:
```json
"checks": { "test": "pytest -x", "lint": "ruff check" }
```

**New Question 6 in interactive setup** — captures test/lint commands before Second Brain (which becomes Question 7).

### Changed — Protocol Files

- **`protocol-verification.md`** — Pre-Checks now calls `mission-checks.mjs pre-checks --json` instead of asking the LLM to run and reason about tests/lint. Report template populated from `tests.passed`/`lint.errors` script output.
- **`protocol-audit.md`** — new Step 0.5 runs `audit-prefilter` before spawning the 5 reviewer subagents. All reviewer prompts include the prefilter `findings` array to skip re-detection.
- **`protocol-implementation.md`** — Step 3 (TODO Scan) replaced with Post-Implement Verification script call. Handles both TODO tracking and test/lint gate in one pass.
- **`protocol-testing.md`** — new Running Tests section calls `pre-checks --skip lint,todos --json` after test authoring.

### Fixed — Codex Pause-Gate Compatibility

Codex was running through phase boundaries without stopping. Three root causes fixed:

- **`SKILL.md` Medium autonomy** — replaced soft "continue unless user intervenes" with hard STOP + explicit "Reply 'continue' to proceed" gate. Matches the contract already documented in `autonomy-levels.md`.
- **`protocol-phase-transition.md`** — Low and Medium entries now use explicit "do not proceed without an explicit reply" language. High entry clarifies it only pauses on hard failures.
- **`SKILL.md` AskUserQuestion fallback** — added tool-agnostic plain-text fallback paragraphs after both `AskUserQuestion` calls (setup Question 1 and model assignment). Codex now presents options as plain text and waits rather than auto-picking.
- **`autonomy-levels.md`** — added hard-stop contract note at the top: pause gates apply across all tools (Claude Code, Codex, OpenCode, Pi, etc.).

---

## Prior Changes (from git log)

### Token tracking
Added `mission-state.mjs tokens` subcommand for per-phase and per-role token usage reporting.

### Model assignment
Interactive model assignment during setup — configure explorer/planner/worker/reviewer roles independently to balance cost vs. capability.

### Obsidian second brain integration
`/obsidian` skill for reading, writing, searching, and linking vault notes. Integrated into all mission phases: vault-first discovery, decision records, TODO sync.

### Failure escalation and auto-handoff
Retry loop with per-session (3 attempts) and cross-session (6 attempts) ceilings. Automatic `handoff.md` generation when escalation is exhausted. Session continuity via state file + handoff doc.

### Performance scoring
Rubric-based quality/completeness/efficiency scoring after every subagent return. Scores fed into subsequent subagent prompts to guide model behavior.
