# Planning Protocol — Read-Only Spec Phase

You are in the **PLANNING** phase. Your job is to produce a detailed, actionable specification using parallel discovery agents.

## Rules

- **DO NOT edit any source files.** You may only READ the codebase.
- **DO NOT create branches, install packages, or run generators.** Analysis only.
- You MUST present a complete plan and wait for explicit user approval before proceeding.

## Process

### Step 0: Read Project Instructions

Before launching any agents, read `CLAUDE.md` (and `AGENTS.md` if present) in the project root and any parent directories. These contain project-specific conventions, constraints, and instructions that must be honored throughout the mission. Note anything that affects the planning approach.

### Step 1: Parallel Codebase Discovery

Launch **3 Explore subagents in parallel** to analyze the codebase simultaneously. Give each a specific focus, the mission description, and the contents of CLAUDE.md. Collect their findings before proceeding.

**Agent 1 — Structure & Architecture:**
```
Explore the codebase at [project root] for this mission: "[description]"

Project instructions from CLAUDE.md:
[paste CLAUDE.md contents]

Focus on:
- Project structure, directory layout, entry points
- Technology stack, frameworks, key dependencies
- Architecture patterns (MVC, service layer, etc.)
- Module/package boundaries and naming conventions
- Configuration files and environment setup

Return a structured summary: stack, architecture, key files, conventions to follow.
```

**Agent 2 — Domain & Data:**
```
Explore the codebase at [project root] for this mission: "[description]"

Project instructions from CLAUDE.md:
[paste CLAUDE.md contents]

Focus on:
- Existing domain models, schemas, types relevant to the mission
- Database patterns (migrations, ORMs, query conventions)
- API surface (routes, controllers, endpoints) related to the mission area
- External integrations or services involved
- Data flow from input to storage

Return: relevant models, routes, data patterns, and any existing code we must extend.
```

**Agent 3 — Testing & Quality:**
```
Explore the codebase at [project root] for this mission: "[description]"

Project instructions from CLAUDE.md:
[paste CLAUDE.md contents]

Focus on:
- Test framework and file/directory structure
- Testing patterns (unit vs integration, fixtures, factories, mocks)
- CI configuration and quality gates
- Linting/formatting rules
- How existing features similar to this mission were tested

Return: test patterns to follow, example test files to mirror, quality requirements.
```

After all 3 agents complete, synthesize their findings:
- Merge overlapping observations
- Flag any contradictions or uncertainties
- Note gaps where more information is needed

### Step 2: Requirement Decomposition

Using the discovery findings, break the mission into discrete, independently deliverable work items. For each item, identify:
- **Files affected** — which files will be created or modified (use exact paths from discovery)
- **Key decisions** — trade-offs and approach choices
- **Verification** — how to confirm correctness (reference test patterns from Agent 3)

### Step 3: Dependency Mapping

- Order work so that dependencies are satisfied first
- Identify shared foundations (types, schemas, utilities) that must come first
- Flag any external dependencies or user decisions needed

### Step 4: Spec Presentation

Present the full plan in a clear, structured format:
- Mission overview and approach
- Files to create/modify (with exact paths)
- Key decisions and trade-offs
- Validation assertions

Ask: "Does this capture everything? Any changes before I proceed?"

Iterate until the user says "approve", "go", "lgtm", or equivalent.

## Output Format

```
## Mission: [description]

### Discovery Summary
- Stack: [tech stack]
- Key patterns: [conventions to follow]
- Test framework: [framework + patterns]

### Milestone 1: [name]
[description]

#### Feature 1.1: [id] — [description]
- Preconditions: [list]
- Expected behavior: [list]
- Verification: [list]
- Files: [exact paths]

### Validation Assertions
- [VA-001] [area]: [title] — [description]

### Estimated effort: [summary]
```

**Remember: READ ONLY. Do not edit files until the spec is approved and you move to implementation.**

## Phase Transition

Once the user explicitly approves the plan:

1. Read the mission state from `.claude/missions/active-mission.json`
2. Mark the current phase as done: set `status: "done"` and `completedAt` to current ISO timestamp
3. Set the next phase as active: set `status: "active"` and `startedAt` to current ISO timestamp
4. Add a progress log entry: `{ "timestamp": "...", "type": "phase_complete", "detail": "Architect phase complete" }`
5. Write the updated state back to the file
6. Update the current phase Task to `completed` via TaskUpdate
7. Update the next phase Task to `in_progress` via TaskUpdate
8. Read the next phase's protocol from the skill's `references/` directory
9. Continue with the new phase (respecting autonomy level — if low, pause and wait for user)
