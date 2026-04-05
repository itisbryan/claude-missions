# Planning Protocol — Read-Only Spec Phase

You are in the **PLANNING** phase. Produce a detailed, actionable spec using parallel discovery agents.

## Rules

- **DO NOT edit any source files.** Read-only analysis.
- **DO NOT create branches, install packages, or run generators.**
- Present a complete plan and wait for explicit user approval.

## Process

### Step 0: Load Context (compaction-safe)

Always run this step first. Compaction may have removed earlier context.

1. Run `node scripts/mission-state.mjs status` — confirm you're in the Architect/Plan phase
2. Read `CLAUDE.md` / `AGENTS.md` if present — note conventions that affect planning
3. Read `.claude/missions/active-mission.json` — get `modelAssignment`, `constraints`, and `secondBrain`
3. **If `secondBrain` is set — search the vault first:**
   - Read `.vault-index.json` from the vault directory
   - Search the index for notes related to the mission description (by tag, title, summary)
   - Read any matching notes — these contain prior decisions, patterns, and domain knowledge
   - Factor vault findings into the discovery and spec. Reference vault notes with `[[wikilinks]]` in the plan.
   - Also check for `code-todos.md` — existing TODOs/FIXMEs may be relevant to this mission

### Step 1: Parallel Codebase Discovery

Launch **3 Explore subagents in parallel** using the `modelAssignment.explorer` model. Keep prompts focused — pass only a one-line CLAUDE.md summary, not the full file.

**Agent 1 — Structure & Architecture** `(model: modelAssignment.explorer)`:
```
Mission: "[description]" | Project: [root path]
CLAUDE.md summary: [one-line summary of key conventions]

Find: project structure, tech stack, frameworks, architecture patterns, naming conventions, config files.
Return: stack, architecture, key files, conventions — bullet points only.
```

**Agent 2 — Domain & Data** `(model: modelAssignment.explorer)`:
```
Mission: "[description]" | Project: [root path]
CLAUDE.md summary: [one-line summary]

Find: domain models/schemas/types relevant to mission, database patterns, API routes/endpoints in the affected area, external integrations, data flow.
Return: relevant models, routes, data patterns, code to extend — bullet points only.
```

**Agent 3 — Testing & Quality** `(model: modelAssignment.explorer)`:
```
Mission: "[description]" | Project: [root path]
CLAUDE.md summary: [one-line summary]

Find: test framework, test directory structure, test patterns (unit/integration/fixtures/mocks), CI config, linting rules, similar test examples.
Return: test patterns to follow, example files to mirror, quality requirements — bullet points only.
```

After all 3 complete, synthesize: merge overlapping findings, flag contradictions, note gaps.

### Step 2: Write the Spec

Using discovery findings, decompose into work items. For each:
- **Files** — exact paths from discovery
- **Key decisions** — trade-offs
- **Verification** — how to confirm correctness

Order by dependency. Identify shared foundations first.

### Step 3: Present for Approval

```
## Mission: [description]

### Discovery Summary
- Stack: [tech stack]
- Patterns: [conventions]
- Tests: [framework + patterns]

### Milestone 1: [name]

#### Feature 1.1: [id] — [description]
- Files: [exact paths]
- Verification: [how to confirm]

### Validation Assertions
- [VA-001] [area]: [title] — [description]
```

Ask: "Does this capture everything? Any changes before I proceed?"
Iterate until user says "approve", "go", "lgtm", or equivalent.

**READ ONLY. Do not edit files until approved.**

## Second Brain

If `secondBrain` is set in state, write `01-discovery.md` (synthesized findings) and `02-plan.md` (approved spec) following `references/protocol-second-brain.md`. Also create the `_index.md` MOC.

## Phase Transition

Once the user approves, follow the steps in `references/protocol-phase-transition.md`.
