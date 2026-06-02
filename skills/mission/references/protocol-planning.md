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
3. Read `.missions/active-mission.json` — get `modelAssignment` and `constraints`

### Step 1: Parallel Codebase Discovery

**Step 1.0 — Size the scout party.** Don't always launch 3. Read `template` and `mode` from state (`node "$MISSION_SCRIPT" get template`, `get mode`) and pick the scout count:

| Situation | Scouts |
|---|---|
| `template: bugfix` | **1** — one combined "Structure & Testing" scout (find the defect + how it's tested) |
| `template: investigation` | **1** — one research-focused scout aimed at the open question |
| `mode: minimal` (other) | **2** — Structure & Architecture + Domain & Data |
| `mode: standard`, narrow scope (description names a single module/file/component) | **2** — Structure + Domain; skip dedicated Testing discovery (infer test patterns from the affected module) |
| `mode: standard`, broad scope | **3** — all three lenses |

Fewer scouts on lean missions is correct, not a shortcut — it also means slightly lower phase XP, which lean missions shouldn't earn. When unsure between two counts, pick the higher one.

Launch the selected read-only exploration subagents **in parallel**. Keep prompts focused — pass only a one-line project instructions summary, not the full file.

> **Dispatch note:** Use your tool's read-only/exploration subagent mechanism. Claude Code: `subagent_type: "Explore"`; Codex/OpenCode/Amp: use equivalent read-only agent mode. Pass `model: <modelAssignment.explorer>` (canonical Haiku 4.5 by default — see `protocol-cross-tool.md`).

> **Discovery cache (experimental, opt-in — off by default).** When running 2+ scouts, you can avoid each one re-mapping the same tree: dispatch **Agent 1 (Structure) first**, then write its structural findings to `.missions/discovery-index.json` (`{ "tree": [≤2-level dir list], "keyFiles": [...], "stack": [...], "configs": [...] }`). Dispatch the remaining scouts in parallel afterward, telling them to **read `.missions/discovery-index.json` first and skip directories already mapped there**. This trades one scout's latency for reduced duplicate file I/O — worthwhile on token-optimized runs; skip it (run all scouts fully parallel) if latency matters more. Measure before relying on a specific savings number.

Before dispatching each Scout, fetch and (if non-empty) prepend class lessons — `LESSONS=$(node "$MISSION_SCRIPT" lessons Scout)`. See `references/protocol-lessons-fetch.md` for the prepend format.

**Agent 1 — Structure & Architecture**
```
Mission: "[description]" | Project: [root path]
Project instructions summary: [one-line summary of key conventions]

Find: project structure, tech stack, frameworks, architecture patterns, naming conventions, config files.
Return: stack, architecture, key files, conventions — bullet points only.
```

**Agent 2 — Domain & Data** *(scout count ≥ 2)*
```
Mission: "[description]" | Project: [root path]
Project instructions summary: [one-line summary]
[If a discovery cache exists]: Read .missions/discovery-index.json first; skip directories already mapped there.

Find: domain models/schemas/types relevant to mission, database patterns, API routes/endpoints in the affected area, external integrations, data flow.
Return: relevant models, routes, data patterns, code to extend — bullet points only.
```

**Agent 3 — Testing & Quality** *(scout count = 3)*
```
Mission: "[description]" | Project: [root path]
Project instructions summary: [one-line summary]
[If a discovery cache exists]: Read .missions/discovery-index.json first; skip directories already mapped there.

Find: test framework, test directory structure, test patterns (unit/integration/fixtures/mocks), CI config, linting rules, similar test examples.
Return: test patterns to follow, example files to mirror, quality requirements — bullet points only.
```

For a **1-scout** party (bugfix/investigation), give the single scout a merged brief covering structure + the one lens that matters most for the mission (testing for bugfix, the open question for investigation).

After all scouts complete, synthesize: merge overlapping findings, flag contradictions, note gaps.

### Step 1.5 — Score explorer outputs (batch)

After all dispatched Explore subagents return, score each on 3 dimensions (1–5):
- **quality** (output correctness/depth), **completeness** (coverage of the ask), **efficiency** (signal-to-noise)
- composite and verdict are **derived by the script** — you may pass only `{quality,completeness,efficiency}`. (composite = quality×0.5 + completeness×0.3 + efficiency×0.2; verdict: 4.5+ outstanding · 3.5+ solid · 2.5+ needs_improvement · 1.5+ poor · else failed)
- **feedback: ≤20 words, one sentence, actionable** (not "good job")

Batch all scores into one call — **one entry per scout you actually dispatched** (trim the example to match your scout count):

```bash
node "$MISSION_SCRIPT" score-batch '[
  {
    "agent": "explorer-1", "role": "explorer", "model": "<modelAssignment.explorer>",
    "phase": "Architect", "task": "Structure & Architecture",
    "scores": {"quality":4,"completeness":3,"efficiency":5,"composite":3.9},
    "usage": {"totalTokens":0,"toolUses":0,"durationMs":0},
    "verdict": "solid",
    "feedback": "Missed the middleware chain — trace request lifecycle next run."
  },
  { ... },
  { ... }
]'
```

If `$MISSION_SCRIPT` is unset, use `~/.claude/skills/mission/scripts/mission-state.mjs`.
See `references/protocol-cross-tool.md` for portability conventions.

Feed prior scores into Step 2's spec-writing context using the feed-forward templates in `protocol-scoring.md`.

### Step 2: Write the Spec

> **Planner model:** write the spec with `modelAssignment.planner` (Opus by default — reserved for the hardest reasoning). For tight-budget or well-scoped missions you may opt into `claude-sonnet-4-6`; if you do, surface that at the Review Plan gate so the user can approve the trade. Keep Opus for security-sensitive or novel-architecture work.

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

**User signal hooks at this boundary:**
- If the user requests plan revisions: `node "$MISSION_SCRIPT" user-signal '{"role":"planner","phase":"Architect","type":"plan_revision","context":"<brief description of requested change>"}'`
- If the user approves on the **first try** (no prior revision requests this phase): `node "$MISSION_SCRIPT" user-signal '{"role":"planner","phase":"Architect","type":"approval_first_try"}'`

**READ ONLY. Do not edit files until approved.**

## Phase Transition

Once the user approves, follow the steps in `references/protocol-phase-transition.md`.
