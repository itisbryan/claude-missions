# Handoff Protocol

Generate a structured handoff document so a new session or agent can pick up the mission without losing context.

## When to Generate

- `/mission handoff` — explicit user request
- Failure escalation — after Opus debug agent also fails, auto-generate before pausing
- Context exhaustion — if the session is running low on context, proactively suggest a handoff

## Handoff Document Format

Write to `.missions/handoff.md`:

```markdown
# Mission Handoff

## Mission
- **Description:** [mission description]
- **Template:** [feature/bugfix/refactor/investigation/custom]
- **Mode:** [standard/minimal]
- **Autonomy:** [low/medium/high]
- **Constraints:** [user constraints or "none"]
- **Started:** [timestamp]
- **Elapsed:** [duration]

## Model Assignment
| Role | Model |
|------|-------|
| Explorer | [model] |
| Planner | [model] |
| Worker | [model] |
| Business Reviewer | [model] |
| Security Reviewer | [model] |
| Edge Case Reviewer | [model] |
| Reviewer | [model] |
| Verifier | [model] |

## Phase Status
| # | Phase | Status | Duration | Notes |
|---|-------|--------|----------|-------|
| 1 | [name] | done | Xm | [one-line summary of what was accomplished] |
| 2 | [name] | done | Xm | [summary] |
| 3 | [name] | active | Xm so far | [what's in progress, what's left] |
| 4 | [name] | pending | — | — |

## Approved Plan
[Paste the full plan from the Architect phase — milestones, features, validation assertions]

## Work Completed
[For each completed work item:]
- [x] Feature 1.1: [description] — [files changed]
- [x] Feature 1.2: [description] — [files changed]
- [ ] Feature 2.1: [description] — in progress / not started

## Current State
- **Active phase:** [phase name]
- **Current work item:** [what's being worked on]
- **Progress:** [what's been done in this phase so far]
- **Blockers:** [anything preventing progress]

## Failure Log
[If any work items failed:]

### [Work item name]
- **Attempts:** [n]
- **Attempt 1:** [what was tried, what error occurred]
- **Attempt 2:** [different approach, what error occurred]
- **Attempt 3:** [fresh subagent, what error occurred]
- **Opus debug:** [if escalated — root cause analysis, proposed fix, outcome]
- **Status:** [unresolved / resolved]

## Files Changed
[Output of `git diff --stat` against the base branch]

## Context for Next Session
- [Any important decisions made during this mission]
- [Things that were tried and didn't work (avoid repeating)]
- [Key codebase patterns discovered during Architect phase]
- [Anything the next agent should know that isn't in the plan]
```

## Rules

- Include ALL context needed for a cold start — the next session has zero memory of this one
- Be specific about failures — "it didn't work" is useless, include error messages and stack traces
- Include the git diff stat so the next session knows what files were already changed
- If the plan was revised during implementation, include the revised version, not the original
