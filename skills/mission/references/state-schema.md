# Mission State Schema — `.missions/active-mission.json`

Full reference for the mission state file. **You normally never hand-author or hand-read this** — `scripts/mission-state.mjs` is the single writer and the source of truth (`get <field>`, `status`, `score`, `phase-transition`, etc.). This document exists so you can interpret a field when debugging.

The `phases` array is written at setup (see SKILL.md §4 for the standard/minimal phase templates). Everything else is maintained by the script.

```json
{
  "description": "<mission description>",
  "mode": "standard|minimal",
  "autonomy": "low|medium|high",
  "template": "feature|bugfix|refactor|investigation|custom",
  "constraints": "<optional user-supplied constraints, or null>",
  "checks": { "test": "<test command, or null>", "lint": "<lint command, or null>" },
  "optimizations": {
    "gateSecurityReviewer": false,
    "microMissionMode": false
  },
  "modelAssignment": {
    "explorer": "claude-haiku-4-5-20251001",
    "planner": "claude-opus-4-8",
    "worker": "claude-sonnet-4-6",
    "business_reviewer": "claude-sonnet-4-6",
    "security_reviewer": "claude-sonnet-4-6",
    "edge_case_reviewer": "claude-sonnet-4-6",
    "reviewer": "claude-sonnet-4-6",
    "verifier": "claude-sonnet-4-6"
  },
  "phases": [ ... ],
  "performanceLog": [
    {
      "agent": "explorer-1",
      "role": "explorer",
      "model": "claude-haiku-4-5-20251001",
      "phase": "Architect",
      "task": "description",
      "scores": { "quality": 4, "completeness": 3, "efficiency": 5, "composite": 3.9 },
      "verdict": "solid",
      "feedback": "actionable feedback"
    }
  ],
  "failureLog": [
    {
      "workItem": "feature id",
      "attempts": [
        { "attempt": 1, "session": 1, "approach": "...", "error": "...", "timestamp": "..." }
      ],
      "totalAttempts": 0,
      "escalatedTo": null,
      "resolved": false
    }
  ],
  "gamification": {
    "totalXp": 0,
    "scoringStreak": 0,
    "longestStreak": 0,
    "verdictCounts": { "outstanding": 0, "solid": 0, "needs_improvement": 0, "poor": 0, "failed": 0 },
    "byRole": {
      "explorer": { "xp": 0, "runs": 0, "avgComposite": 0, "sumComposite": 0, "class": "Scout" }
    },
    "byPhase": {
      "Architect": { "expected": null, "scored": 0, "xp": 0, "verdicts": [], "party": [] }
    },
    "userSignalCounts": { "positive": 0, "negative": 0, "neutral": 0 },
    "userRating": null
  },
  "userSignals": [
    {
      "role": "planner",
      "phase": "Architect",
      "type": "plan_revision",
      "delta": -10,
      "context": "User asked for a different library choice",
      "timestamp": "2026-04-17T..."
    }
  ],
  "userRating": null,
  "paused": false,
  "pauseHistory": [],
  "progressLog": [
    { "timestamp": "<now>", "type": "phase_start", "detail": "Mission started — entering <first phase>" }
  ],
  "startedAt": "<now>",
  "completedAt": null
}
```

`modelAssignment` values must stay in sync with `DEFAULT_MODEL_DEFAULTS["claude-code"]` in `scripts/mission-state.mjs`. Use full, dated model IDs (not `haiku`/`opus`/`sonnet` aliases) — see `protocol-cross-tool.md`.

`optimizations` is **optional and off by default** (absent = all `false`). It enables the opt-in aggressive token modes for the Audit phase — see `references/protocol-audit-aggressive.md`. Only the orchestrator sets these, after the user opts in.
