# Second Brain Protocol

When `secondBrain` is set in the mission state, write phase outputs as Obsidian-compatible markdown notes to the vault directory.

## Directory Structure

```
<secondBrain>/missions/<mission-slug>/
├── _index.md                  # Mission overview + MOC (Map of Content)
├── 01-discovery.md            # Architect: codebase analysis findings
├── 02-plan.md                 # Architect: the approved spec/plan
├── 03-review-notes.md         # Review: approval notes, change requests
├── 04-implementation-log.md   # Implement: what was built, decisions made
├── 05-test-report.md          # Test: test results, coverage
├── 06-audit-report.md         # Audit: findings by severity
├── 07-verification-report.md  # Verify: assertion results, verdict
├── handoff.md                 # Handoff context (if generated)
└── decisions/                 # Key decisions and trade-offs
    ├── decision-001.md
    └── ...
```

The `mission-slug` is derived from the description: lowercase, spaces to hyphens, max 50 chars (e.g., "build-rest-api-for-user-management").

## Note Format

Every note uses Obsidian-compatible frontmatter + wikilinks:

```markdown
---
title: <note title>
mission: <mission description>
phase: <phase name>
created: <ISO timestamp>
updated: <ISO timestamp>
tags:
  - mission
  - <phase-name>
  - <template-name>
---

# <Title>

<content>

---
## Links
- [[_index|Mission Overview]]
- [[02-plan|Approved Plan]]
```

## When to Write

Write to the second brain at these moments:

### After Architect phase completes
- **01-discovery.md** — synthesized findings from the 3 Explore agents:
  - Tech stack, architecture, key files
  - Domain models, APIs, data patterns
  - Test framework, CI config, quality gates
- **02-plan.md** — the full approved spec with milestones, features, validation assertions

### After Review phase completes
- **03-review-notes.md** — what the user approved, any changes requested, key decisions

### During/after Implement phase
- **04-implementation-log.md** — append as work items complete:
  - What was implemented and why
  - Files changed
  - Decisions made during implementation (e.g., "chose approach X over Y because...")
  - Any deviations from the plan
- **decisions/decision-NNN.md** — for significant trade-off decisions:
  ```markdown
  ---
  title: "Use Redis for session storage"
  decision: accepted
  date: <timestamp>
  tags: [mission, decision, architecture]
  ---
  # Use Redis for session storage

  ## Context
  Need a session store that supports TTL and horizontal scaling.

  ## Options Considered
  1. In-memory store — simple but doesn't scale
  2. Redis — fast, supports TTL, cluster mode
  3. Database — already have it, but slower for session lookups

  ## Decision
  Redis. Supports TTL natively, horizontal scaling via cluster.

  ## Consequences
  - New infrastructure dependency
  - Need Redis in dev environment
  ```

### After Test phase completes
- **05-test-report.md** — test results, coverage, areas with gaps

### After Audit phase completes
- **06-audit-report.md** — all findings by severity, which reviewers flagged them, fixes applied

### After Verify phase completes
- **07-verification-report.md** — assertion results, test suite + linter status, final verdict

### On handoff
- **handoff.md** — copy of the handoff document for reference

### Mission complete
- Update **_index.md** with final status, elapsed time, and links to all notes

## _index.md Template

```markdown
---
title: "Mission: <description>"
status: <in-progress | complete>
template: <feature | bugfix | refactor | investigation | custom>
mode: <standard | minimal>
autonomy: <low | medium | high>
started: <timestamp>
completed: <timestamp or "in progress">
tags:
  - mission
  - mission/<template>
---

# Mission: <description>

## Status
<phase progress summary>

## Notes
- [[01-discovery|Discovery Findings]]
- [[02-plan|Approved Plan]]
- [[03-review-notes|Review Notes]]
- [[04-implementation-log|Implementation Log]]
- [[05-test-report|Test Report]]
- [[06-audit-report|Audit Report]]
- [[07-verification-report|Verification Report]]

## Decisions
- [[decisions/decision-001|Decision 1 title]]
- ...

## Timeline
<progress log entries>
```

## Rules

- **Always check** if `secondBrain` is set before writing. If null, skip all second brain writes.
- **Create directories** as needed (`missions/<slug>/`, `decisions/`).
- **Use wikilinks** (`[[note-name]]`) for cross-references within the mission folder.
- **Use tags** consistently for Obsidian graph view: `mission`, phase names, template name.
- **Append, don't overwrite** implementation-log.md — add new entries at the bottom as work items complete.
- **Keep notes concise** — these are reference material, not verbose logs. Summarize, link to code.
