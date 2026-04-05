# claude-missions

Multi-phase development mission orchestrator for Claude Code. Runs structured workflows — plan, review, implement, test, audit, verify — with phase-specific protocols, parallel discovery agents, and persistent state across sessions.

## Install

```bash
npx skills add itisbryan/claude-missions
```

## Usage

```bash
/mission build a REST API for user management   # start a new mission
/mission status                                  # current phase + progress
/mission log                                     # full timeline with durations
/mission skip                                    # skip current phase
/mission pause / resume                          # pause and resume
/mission done                                    # mark complete
/mission reset                                   # clear state
```

## How It Works

When you start a mission, Claude asks you to choose a **template** and **autonomy level**, then runs through structured phases:

### Standard mode (6 phases)
| Phase | What happens |
|---|---|
| 📐 Architect | 3 parallel Explore agents analyze structure, domain, and tests — then synthesize a spec |
| 👁️ Review Plan | Present spec, wait for explicit approval before any code is written |
| 🔨 Implement | Execute plan using parallel subagents for independent work items |
| 🧪 Test | Unit → integration → edge cases → error paths |
| 🔍 Audit | 3 parallel reviewers (correctness, security, performance) merge findings |
| ✅ Verify | Assertion-based validation against the spec, full test suite + linter |

### Minimal mode (3 phases)
Plan → Build (impl + test combined) → Verify

## Templates

| Template | Mode | Autonomy | Best for |
|---|---|---|---|
| **Feature** | Standard | Medium | New functionality |
| **Bug Fix** | Minimal | Low | Regression-test-first fixes |
| **Refactor** | Standard | Medium | Behavior-preserving restructure |
| **Investigation** | Minimal | High | Spikes and research |
| **Custom** | Your choice | Your choice | Everything else |

## Autonomy Levels

- **Low** — pause after every phase, wait for "continue"
- **Medium** — pause at phase boundaries, continue through routine work
- **High** — run to completion, stop only on critical failures

## Key Behaviors

- **Reads `CLAUDE.md`** at mission start and passes it to every subagent
- **Creates a git worktree** via `git-worktree` skill to isolate work on a mission branch
- **Parallel discovery** in Architect: 3 Explore agents run simultaneously (structure, domain, tests)
- **Parallel audit** in Audit: 3 specialist reviewers run simultaneously (correctness, security, performance)
- **State persists** across sessions in `.claude/missions/active-mission.json`
- **Phase tasks** are created in Claude Code's task list so progress is always visible

## State File

Mission state is stored in `.claude/missions/active-mission.json` in your project. It survives session restarts — `/mission` with no arguments resumes where you left off.
