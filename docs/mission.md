# /mission — Mission Orchestrator

## Modes

### Standard (6 phases)

| # | Phase | What happens |
|---|---|---|
| 1 | 📐 Architect | 3 parallel Explore agents analyze the codebase, then synthesize a spec |
| 2 | 👁️ Review Plan | Present the spec, wait for explicit approval |
| 3 | 🔨 Implement | Execute plan with parallel subagents |
| 4 | 🧪 Test | Unit, integration, edge cases, error paths |
| 5 | 🔍 Audit | 5 parallel reviewers merge and deduplicate findings |
| 6 | ✅ Verify | Assertion-based validation, full test suite + linter |

### Minimal (3 phases)

| # | Phase | What happens |
|---|---|---|
| 1 | 📋 Plan | Analyze codebase, outline approach, wait for approval |
| 2 | 🔨 Build | Implement + test combined |
| 3 | ✅ Verify | Run test suite, linter, validate against assertions |

## Templates

| Template | Mode | Autonomy | What it does |
|---|---|---|---|
| **Feature** | Standard | Medium | Full rigor. Backward compatibility + auth checks. |
| **Bug Fix** | Minimal | Low | Regression-test-first. Minimal change only. |
| **Refactor** | Standard | Medium | Behavior-preserving. Characterization tests first. |
| **Investigation** | Minimal | High | Output is a report, not code. |
| **Custom** | Choose | Choose | No template constraints. |

## Model Assignment

Choose which Claude model runs each subagent role:

| Role | Default | Used in |
|---|---|---|
| Explorer | `haiku` | Architect: 3 parallel discovery agents |
| Planner | `opus` | Architect: spec writing |
| Worker | `sonnet` | Implement/Build: parallel code subagents |
| Business Reviewer | `sonnet` | Audit: spec alignment, business logic |
| Security Reviewer | `sonnet` | Audit: injection, auth, secrets |
| Edge Case Reviewer | `sonnet` | Audit: boundaries, nulls, partial failures |
| Reviewer | `sonnet` | Audit: async/concurrency + performance |
| Verifier | `sonnet` | Verify: test + lint validation |

## Autonomy Levels

| Level | Behavior |
|---|---|
| **Low** | Pause after every phase. Wait for "continue". |
| **Medium** | Pause at phase boundaries. Continue through routine work. |
| **High** | Run to completion. Stop only on critical failures. |

All levels force-pause when failure escalation exhausts retries.

## Setup Flow

When you run `/mission <description>`:

1. **Template** — Feature, Bug Fix, Refactor, Investigation, or Custom
2. **Mode** — Standard or Minimal (auto-set by template)
3. **Autonomy** — Low, Medium, or High (auto-set by template)
4. **Constraints** — optional boundaries
5. **Model Assignment** — which model runs each subagent role
6. **Checks** — test/lint commands (auto-discovered from `package.json` or common binaries; override here or via `active-mission.json`)
7. **Second Brain** — optional Obsidian vault path
8. **CLAUDE.md** — project instructions read and passed to all subagents
9. **Git worktree** — isolated branch created for the mission

## State File

Mission state persists at `.missions/active-mission.json`. Survives session restarts, compaction, and handoffs. Run `/mission` with no args to resume.

## Host Tool Detection

At startup, `/mission` auto-detects which AI coding tool is running (Claude Code, Codex, Amp, OpenCode) by inspecting environment variables. Model defaults and pause-gate behavior are adjusted per tool — e.g., Codex uses plain-text STOP gates instead of `AskUserQuestion`.

## Career Profile

Model assignments and cross-mission performance stats are persisted to `$XDG_CONFIG_HOME/mission/profile.json` (default `~/.config/mission/profile.json`). At the start of each new mission, saved defaults for the detected tool are pre-loaded into the model assignment step so you don't have to re-configure each time. The profile merges mission XP, verdicts, and ratings after every completed mission. See [Scoring & Tokens](scoring.md) for the full gamification system.
