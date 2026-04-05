# claude-missions

Multi-phase development mission orchestrator for [Claude Code](https://claude.ai/code). Inspired by [pi-missions](https://github.com/itisbryan/pi-missions).

Runs structured workflows — plan, review, implement, test, audit, verify — with parallel subagents, per-role model assignment, and persistent state across sessions.

## Install

```bash
npx skills add itisbryan/claude-missions
```

## Quick Start

```bash
/mission build a REST API for user management
```

Claude will walk you through setup (template, autonomy, model assignment), then execute a structured multi-phase workflow automatically.

## Commands

| Command | Description |
|---|---|
| `/mission <description>` | Start a new mission |
| `/mission status` | Current phase and progress |
| `/mission log` | Full timeline with per-phase durations |
| `/mission skip` | Skip the current phase |
| `/mission pause` | Pause the mission |
| `/mission resume` | Resume a paused mission |
| `/mission handoff` | Generate handoff doc and pause for session transfer |
| `/mission done` | Mark mission complete early |
| `/mission reset` | Clear all mission state |

## Modes

### Standard (6 phases)

| # | Phase | What happens |
|---|---|---|
| 1 | 📐 Architect | 3 parallel Explore agents analyze the codebase (structure, domain, tests), then synthesize a spec |
| 2 | 👁️ Review Plan | Present the spec to you, wait for explicit approval before writing any code |
| 3 | 🔨 Implement | Execute the plan — dispatches parallel subagents for independent work items |
| 4 | 🧪 Test | Write and run tests: unit, integration, edge cases, error paths |
| 5 | 🔍 Audit | 3 parallel reviewers (correctness, security, performance) merge and deduplicate findings |
| 6 | ✅ Verify | Assertion-based validation against the spec, full test suite + linter |

### Minimal (3 phases)

| # | Phase | What happens |
|---|---|---|
| 1 | 📋 Plan | Analyze codebase, outline approach, wait for approval |
| 2 | 🔨 Build | Implement + test combined — write code and tests together |
| 3 | ✅ Verify | Run test suite, linter, validate against assertions |

## Templates

Templates pre-configure the mode, autonomy level, and phase-specific constraints:

| Template | Mode | Autonomy | What it does |
|---|---|---|---|
| **Feature** | Standard | Medium | Full rigor for new functionality. Extra attention to backward compatibility and auth. |
| **Bug Fix** | Minimal | Low | Write a failing regression test first, then fix. Minimal change only. |
| **Refactor** | Standard | Medium | Behavior must be identical before and after. Characterization tests first. |
| **Investigation** | Minimal | High | Output is a report, not production code. Explore and answer specific questions. |
| **Custom** | Choose | Choose | No template constraints. Configure everything manually. |

## Model Assignment

Choose which Claude model runs each subagent role. This lets you balance cost and capability — use cheaper models for exploration and more capable models for planning and review.

| Role | Default | Used in |
|---|---|---|
| Explorer | `haiku` | Architect: 3 parallel discovery agents |
| Planner | `opus` | Architect: spec writing |
| Worker | `sonnet` | Implement/Build: parallel code subagents |
| Business Reviewer | `sonnet` | Audit: spec alignment, business logic, domain invariants |
| Security Reviewer | `sonnet` | Audit: injection, auth, secrets, data exposure |
| Edge Case Reviewer | `sonnet` | Audit: boundary values, null inputs, partial failures |
| Reviewer | `sonnet` | Audit: async/concurrency + performance/architecture |
| Verifier | `sonnet` | Verify: test + lint validation |

Defaults are applied automatically. During setup, you can accept them or override any role.

## Autonomy Levels

| Level | Behavior |
|---|---|
| **Low** | Pause after every phase. Wait for you to say "continue" before advancing. |
| **Medium** | Pause at phase boundaries for a status check. Continue through routine work. |
| **High** | Run all phases to completion. Only stop on critical failures or missing dependencies. |

## Failure Escalation & Auto-Handoff

The orchestrator (`/mission`) manages all retries and escalation automatically. Subagents are workers — they report success or failure, they don't make decisions.

```
Subagent fails → Orchestrator logs it
                        ↓
              Attempt < 3? → Spawn new subagent (knows what failed, won't repeat)
                        ↓ no
              Escalate to Opus debug agent with full failure log
                        ↓
              Opus succeeds? → Continue
                        ↓ no
              Auto-generate handoff.md → Pause mission → Inform user
```

- Every attempt is logged in `failureLog` — failed approaches are never repeated
- Subagents don't track attempts or decide to escalate — the orchestrator does
- New session runs `/mission` → reads `handoff.md` → resumes with full context

### Manual handoff

You can also force a handoff at any time:

```bash
/mission handoff
```

This generates `.claude/missions/handoff.md` with the full mission context (config, phase status, plan, failure log, git diff) and pauses the mission.

## How It Works

### Setup Flow

When you run `/mission <description>`:

1. **Template** — choose Feature, Bug Fix, Refactor, Investigation, or Custom
2. **Mode** — Standard (6 phases) or Minimal (3 phases) — auto-set by template
3. **Autonomy** — Low, Medium, or High — auto-set by template
4. **Constraints** — optional boundaries (e.g., "don't touch auth module")
5. **Model Assignment** — which model runs each subagent role
6. **CLAUDE.md** — project instructions are read and passed to all subagents
7. **Git worktree** — an isolated branch is created for the mission

### During Execution

- Each phase reads its protocol from `references/` and follows it exactly
- Subagents are dispatched with the model you assigned to their role
- CLAUDE.md is summarized and passed to every subagent to honor project conventions
- Phase transitions update the state file and Claude Code task list
- Autonomy gates control when to pause for your input

### Parallel Subagents

The skill uses parallel subagents in three phases:

**Architect** — 3 Explore agents run simultaneously:
- Agent 1: Project structure, stack, architecture patterns
- Agent 2: Domain models, schemas, APIs, data flow
- Agent 3: Test framework, patterns, CI config, quality gates

**Implement** — parallel worker agents for independent work items that touch non-overlapping files

**Audit** — 5 specialist reviewers run simultaneously:
- Reviewer 1: Business logic — does the code match every spec requirement?
- Reviewer 2: Security — injection, auth bypass, secrets, data exposure
- Reviewer 3: Edge cases — null inputs, boundary values, partial failures, off-by-one
- Reviewer 4: Async & concurrency — race conditions, unawaited promises, deadlocks
- Reviewer 5: Performance & architecture — N+1 queries, memory leaks, SRP violations

## State & Persistence

Mission state is stored at `.claude/missions/active-mission.json` in your project directory.

- Survives session restarts — run `/mission` to pick up where you left off
- Tracks phase status, timestamps, autonomy level, model assignment, and a progress log
- `/mission log` shows the full timeline with per-phase durations

## Project Structure

```
claude-missions/
├── SKILL.md                              # Core orchestrator
└── references/
    ├── protocol-planning.md              # Architect/Plan phase
    ├── protocol-review.md                # Plan approval gate
    ├── protocol-implementation.md        # Implement phase
    ├── protocol-minimal-build.md         # Build phase (minimal mode)
    ├── protocol-testing.md               # Test phase
    ├── protocol-audit.md                 # Audit phase
    ├── protocol-verification.md          # Verify phase
    ├── protocol-phase-transition.md      # Shared transition steps
    ├── templates.md                      # Mission template definitions
    └── autonomy-levels.md               # Autonomy level behaviors
```

## License

MIT
