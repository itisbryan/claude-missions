# Changelog

All notable changes to claude-missions are documented here.

---

## [Unreleased]

### Added — Tests, Doctor, Token Capture & Opt-in Tradeoff Modes

- **Test suite** (`skills/mission/scripts/scripts.test.mjs`, `node:test`) + `package.json` `test` script (`npm test`) — 14 tests covering the scoring contract, input-hardening guardrails, `audit-synthesis`, `doctor`, and `parse-usage`. `mission-checks.mjs` auto-discovers it via `package.json`.
- **`mission-state.mjs doctor`** — programmatic State Validation (required fields, exactly one active phase, phase order, complete `modelAssignment`); JSON verdict + nonzero exit on issues.
- **`mission-state.mjs parse-usage '<block>'`** — extracts `{totalTokens,toolUses,durationMs}` from a subagent usage block (tolerant of label variants) so token accounting isn't transcribed by hand.
- **`mission-checks.mjs audit-synthesis --findings a.json,b.json`** — deterministic merge/dedup of reviewer JSON findings by file+line (highest severity wins), sorted P0→P3.
- **`score-batch`** now rejects arrays > 1000 entries (DoS bound).
- **Opt-in tradeoff modes** (off by default), surfaced as setup Question 7 and documented in `protocol-audit-aggressive.md`: Verifier→Haiku, Planner→Sonnet, `optimizations.jsonSynthesis` (script-side audit synthesis). The discovery-index cache is now explicitly marked experimental/opt-in.

### Removed — Obsidian / Second-Brain Integration from the Mission Skill

The `/mission` skill no longer integrates with Obsidian. The standalone `/obsidian` skill is unchanged and still shipped in the bundle — only the *coupling* was removed.

- Dropped the `secondBrain` config option, Question 7 in setup, and the `## Obsidian Integration` section in `SKILL.md`.
- Removed the per-phase `## Second Brain` sections and all vault reads/writes from every protocol (`protocol-planning`, `-implementation`, `-audit`, `-testing`, `-verification`, `-review`, `-minimal-build`, `-scoring`), including the `## Second Brain Integration` performance-dashboard in `protocol-scoring.md`.
- Deleted `references/protocol-second-brain.md`, removed the `secondBrain` field from `state-schema.md`, and dropped the `/obsidian` vault scripts from the deterministic-ops list.
- Updated docs (`docs/mission.md` setup flow, `docs/scoring.md` Vault Dashboard, `docs/architecture.md` lifecycle diagram, `docs/workflows.md` workflows 1/3/6, README tagline) to remove mission↔vault coupling. Pure `/obsidian` workflows and the Vault Index Lookup architecture remain.
- TODO/FIXME detection still runs (deterministically, inside `mission-checks.mjs`) — it just no longer persists to a vault.

### Token Optimization — Haiku Scouting, Scope Gating & Script Offload

A round of token-efficiency work. Scouting already ran on Haiku 4.5 by default; this round makes that wiring canonical and pushes deterministic work off the LLM. Est. **~15–30K saved per standard mission** at zero quality cost, more with the opt-in modes.

**Model IDs — pinned & consistent (correctness fix)**
- `DEFAULT_MODEL_DEFAULTS["claude-code"]` now pins **`explorer: claude-haiku-4-5-20251001`** (was the dateless `claude-haiku-4-5`, which can resolve to a stale snapshot via Claude Code issue #25588) and **`planner: claude-opus-4-8`** (was `claude-opus-4-7`). Reviewers/worker/verifier stay on `claude-sonnet-4-6`.
- `SKILL.md`, `docs/mission.md`, and `protocol-cross-tool.md` now use the **same full, dated IDs** instead of short `haiku`/`opus`/`sonnet` aliases — runtime and docs no longer disagree. The Scout (explorer) now deterministically lands on current Haiku 4.5.

**Deterministic orchestrator offload — three new `mission-state.mjs` subcommands**
- `score-compute '<json>'` — previews composite/verdict/XP for one agent or a batch without writing state.
- `failure-check "<workItem>" [--session <n>]` — returns the escalation decision (`shouldHardStop` / `shouldEscalate`) plus `priorFailures`, so the orchestrator never counts attempts from memory.
- `progress-summary [phase]` — emits the 3-line Medium-autonomy phase-gate summary.
- `score` / `score-batch` now **accept raw `{quality,completeness,efficiency}`** and derive `composite` + `verdict` themselves (passing explicit values still works).

**Scope-aware reviewer dispatch (safe, always-on)**
- `mission-checks.mjs audit-prefilter --json` now also emits `scope`, `size`, `dispatch`, and `gating`. The Audit phase skips the **Async** and **Performance** reviewers when the changed files show no matching markers — biased to dispatch when uncertain, so the failure mode is "ran an extra reviewer", never "missed a bug". Skipped reviewers are gamification-safe.

**Size-aware scouting + discovery cache**
- `protocol-planning.md` now sizes the scout party (1 for bugfix/investigation, 2 for narrow/minimal, 3 for broad standard) instead of always launching 3, and supports an optional `.missions/discovery-index.json` cache so later scouts skip re-mapping the tree.

**Progressive disclosure**
- Moved the full state schema → `references/state-schema.md` and the lifecycle-command steps → `references/lifecycle-commands.md`, leaving compact pointers in `SKILL.md` (shrinks the file loaded on every invocation). Extracted the repeated lessons-fetch block → `references/protocol-lessons-fetch.md`.

**Aggressive token modes — opt-in, off by default** (`references/protocol-audit-aggressive.md`)
- `optimizations.gateSecurityReviewer` — gate the Security reviewer on scope detection (never enable on auth/PII/payment repos).
- `optimizations.microMissionMode` — merge Async+Perf into one advisory reviewer for tiny diffs (scored as the new `reviewer_architecture` / **Warden** 🏯 role so it doesn't skew Druid), with a single-reviewer choice for single-file changes.
- Documented `business_reviewer`/`edge_case_reviewer` → Haiku as a benchmark-gated `modelAssignment` override (never the Security or async/perf reviewer).

---

## [2026-04-18]

### Added — Subagent Context-Exhaustion Handling

Workers that hit their context limit mid-task now hand off cleanly instead of losing all progress.

**How it works:**
- Workers call `checkpoint-write` after each logical step (file written, tests passing, commit made), saving `completedSteps`, `remainingSteps`, `lastCommit`, and `filesChanged` to `.missions/subagent-checkpoint.json`
- Workers end their output with `<!-- SUBAGENT_DONE: {...} -->` — the orchestrator uses the presence/absence of this marker to distinguish context exhaustion from a real failure
- On missing marker: orchestrator reads the checkpoint and spawns a new subagent with a `RESUMING FROM CHECKPOINT` prefix, skipping already-completed steps. The retry budget is **not** consumed
- On success: orchestrator calls `checkpoint-clear` before moving to the next work item

**Three new `mission-state.mjs` subcommands:**
- `checkpoint-write '<json>'` — atomically saves progress; creates `.missions/` if needed
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

### Gamification & cross-mission learning
XP system with verdict bonuses, scoring streaks, and RPG persona classes (Scout/Mage/Knight/Rogue/Cleric/Ranger/Druid/Paladin). Mission Scorecard printed at completion. User signals (plan revisions, corrections, approvals) contribute XP deltas. Career profile in `~/.config/mission/profile.json` accumulates stats across missions.

### Tool-aware model selection
Auto-detects host tool from environment (Claude Code, Codex, Amp, OpenCode). Model defaults persisted per-tool to `$XDG_CONFIG_HOME/mission/profile.json` — pre-loaded at next mission start. Plain-text STOP fallback for tools without `AskUserQuestion`.

### First-party git-worktree skill
`/git-worktree` skill with auto-detected dependency install (npm, bun, pnpm, yarn, bundle, poetry, uv, pip, go, cargo). Auto-invoked by `/mission` before Phase 1. Includes create/list/cleanup/setup commands with safety guards (path-traversal rejection, no current-worktree removal).
