# Inspiration

## Factory.ai Droids

[Factory.ai](https://factory.ai) builds autonomous coding agents called **Droids** — specialized AI workers that handle entire software engineering tasks end-to-end. Unlike copilots that suggest code, Droids are autonomous workers that plan, implement, test, and submit their work.

### Key patterns borrowed from Factory.ai

**Specialized Droids, not one generalist.** Factory doesn't use a single agent for everything. They deploy purpose-built Droids: code review droids, bug fix droids, migration droids, documentation droids. Each is tuned for its task.

claude-missions adopts this pattern through **role-based model assignment**: explorers (haiku) for fast scanning, planners (opus) for deep reasoning, workers (sonnet) for implementation, and 5 specialist reviewers for auditing — each assigned the right model for their role.

**Mission-based orchestration.** Factory assigns "missions" to Droids — discrete, goal-oriented tasks with clear completion criteria. The Droid autonomously works through the mission with structured phases.

claude-missions uses the same pattern: a mission has a description, phases, validation assertions, and a clear done state. The orchestrator sequences the phases and manages the lifecycle.

**Worker Droid pattern.** Factory's implementation droids follow existing codebase patterns, commit incrementally, and report structured completion results. They don't make architectural decisions — they execute a plan.

claude-missions' `protocol-implementation.md` implements this directly: "Follow existing patterns. Commit incrementally. No scope creep. Implement exactly what the spec says."

**Scrutiny-Feature-Reviewer pattern.** Factory uses dedicated review droids that audit code with a critical eye, classify findings by severity, and require evidence for every claim.

claude-missions' Audit phase spawns 5 parallel specialist reviewers — Business Logic, Security, Edge Cases, Async/Concurrency, and Performance — each with a focused lens and a severity classification (P0-P3). Findings require code evidence.

**User-Testing-Flow-Validator pattern.** Factory validates deliverables through real system interaction, not just reading code. Each assertion is tested through the actual surface with evidence recorded.

claude-missions' Verify phase implements assertion-based validation: load the validation contract from the plan, execute each assertion through the real system, record pass/fail/blocked with evidence.

### What claude-missions adds beyond Factory

| Factory.ai | claude-missions |
|---|---|
| Closed platform | Open skill for Claude Code, installable via `npx skills add` |
| Fixed droid types | Configurable model assignment per role |
| Internal orchestration | Transparent state file + scripts anyone can inspect |
| — | Cross-session handoff with failure log |
| — | Performance scoring with token tracking |
| — | Compaction-resilient orchestration |

## pi-missions

[pi-missions](https://github.com/itisbryan/pi-missions) is a multi-phase mission orchestrator for the **pi** coding agent by [@mariozechner](https://github.com/mariozechner). It was the direct predecessor to claude-missions.

### Key patterns borrowed from pi-missions

**Phase templates.** pi-missions defines Standard (6-phase) and Minimal (3-phase) mission templates with configurable phase sequences. claude-missions uses the same two modes with the same phase structure.

**Per-phase protocol injection.** pi-missions generates rich system prompts for each phase — detailed instructions that control what the agent does and doesn't do. claude-missions uses the same approach via `references/protocol-*.md` files.

**Autonomy levels.** pi-missions defines Low/Medium/High autonomy controlling when the agent pauses for user input. claude-missions adopts the same three levels with the same semantics.

**Phase transition detection.** pi-missions uses regex to detect phase completion from LLM output. claude-missions adapts this to Claude Code's architecture — since we can't intercept output, protocols include explicit transition instructions and the `mission-state.mjs` script handles transitions atomically.

**Role-based model assignment.** pi-missions maps phases to roles (planner, coder, tester, auditor, verifier) and allows per-role model assignment. claude-missions extends this to 8 roles with more granular audit specialization.

**State persistence.** pi-missions uses append-only entries that survive session compaction. claude-missions uses a JSON state file + scripts for the same resilience.

### What claude-missions adds beyond pi-missions

| pi-missions (for pi) | claude-missions (for Claude Code) |
|---|---|
| Widget progress bar | Claude Code Tasks |
| Auto-detection via regex | Protocol-driven self-advancement + scripts |
| `pi.appendEntry()` | JSON state file + Node.js scripts |
| Per-phase model switching | Per-role model assignment (8 roles) |
| 3 audit areas | 5 specialist parallel reviewers |
| — | Failure escalation with Opus debug |
| — | Auto-handoff across sessions |
| — | Performance scoring + token tracking |
| — | TODO scanning and tracking |
| — | Compaction resilience |
