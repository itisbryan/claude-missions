# Scoring Protocol — Subagent Performance Evaluation

The orchestrator evaluates every subagent's output after it completes. Scores are stored in the state file and fed into future prompts to drive improvement.

## When to Score

Score after every subagent returns:
- Explore agents (Architect phase)
- Worker agents (Implement/Build phase)
- Reviewer agents (Audit phase)
- Powerful debug agents (failure escalation)

## Scoring Rubric

Rate each output on 3 dimensions, 1-5 scale:

### Quality (1-5)
| Score | Meaning |
|---|---|
| 5 | Exceptional — thorough, zero issues, exceeded expectations |
| 4 | Good — complete, minor gaps only |
| 3 | Adequate — met basic requirements, some gaps |
| 2 | Below expectations — missing key items, required rework |
| 1 | Failed — output unusable, needed to redo entirely |

### Completeness (1-5)
| Score | Meaning |
|---|---|
| 5 | Covered everything asked + surfaced things we didn't think of |
| 4 | Covered everything asked |
| 3 | Covered most items, missed some |
| 2 | Significant gaps — missed major areas |
| 1 | Barely addressed the prompt |

### Efficiency (1-5)
| Score | Meaning |
|---|---|
| 5 | Concise, focused, no wasted tokens — exactly what was needed |
| 4 | Mostly focused, minor verbosity |
| 3 | Some unnecessary content or redundancy |
| 2 | Significant bloat, repeated itself, included irrelevant info |
| 1 | Mostly noise — had to dig for the useful parts |

### Composite Score
`composite = (quality * 0.5) + (completeness * 0.3) + (efficiency * 0.2)`

### Verdict
| Composite | Verdict | Emoji |
|---|---|---|
| 4.5 - 5.0 | Outstanding | 🏆 |
| 3.5 - 4.4 | Solid | 👏 |
| 2.5 - 3.4 | Needs improvement | 📝 |
| 1.5 - 2.4 | Poor | ⚠️ |
| 1.0 - 1.4 | Failed | 🔴 |

## Performance Log Entry

After scoring, append to `performanceLog` in the state file:

```json
{
  "agent": "explorer-1",
  "role": "explorer",
  "model": "haiku",
  "phase": "Architect",
  "task": "Structure & Architecture analysis",
  "scores": {
    "quality": 4,
    "completeness": 3,
    "efficiency": 5,
    "composite": 3.9
  },
  "usage": {
    "totalTokens": 12450,
    "toolUses": 8,
    "durationMs": 34200
  },
  "verdict": "solid",
  "feedback": "Good structure analysis but missed the middleware chain. Consider tracing request lifecycle next time.",
  "timestamp": "2026-04-05T10:00:00Z"
}
```

### Capturing Token Usage

When a subagent completes, its result includes usage data in this format:
```
<usage>total_tokens: 12450
tool_uses: 8
duration_ms: 34200</usage>
```

Parse these values and include them in the performance log entry. If usage data is not available (e.g., inline execution), estimate by noting "inline" in the agent field and omit the usage block.

### Feedback Field

Write specific, actionable feedback — not generic praise. Examples:

**Good feedback:**
- "Found the race condition in payment.ts that other agents missed. Excellent async analysis."
- "Missed the auth middleware entirely — 3 protected routes have no auth check."
- "Output was 2x longer than needed. The architecture summary could be 5 bullets, not 20."
- "Correctly identified the N+1 query but the suggested fix wouldn't work with the current ORM version."

**Bad feedback:**
- "Good job" (not actionable)
- "Needs improvement" (too vague)
- "Fine" (no signal)

## Feeding Scores Into Future Prompts

When dispatching a new subagent for the same role, include performance context from past runs:

### If previous score was high (≥ 4.0):
```
Performance context: Previous agents in this role scored 4.2/5.
Maintain this standard. Key strength to keep: [feedback excerpt].
```

### If previous score was low (< 3.0):
```
Performance context: Previous agents in this role scored 2.1/5.
Key gap: [feedback excerpt].
Focus specifically on: [the weak dimension].
This is your chance to improve on that result.
```

### If this is a retry after failure:
```
Performance context: This work item failed [N] times.
Previous agent scored 1.5/5. Issue: [feedback].
You MUST address: [specific gap].
Do NOT repeat: [what failed].
```

## Role-Level Trends

After 3+ scores for a role, compute the trend:

```json
{
  "role": "explorer",
  "avgComposite": 3.8,
  "avgTokens": 11200,
  "avgDurationMs": 28000,
  "totalTokens": 67200,
  "runs": 6,
  "trend": "improving",
  "strongestDimension": "efficiency",
  "weakestDimension": "completeness",
  "recommendation": "Explorer agents are fast but miss edge cases. Add 'check for middleware, hooks, and event handlers' to explorer prompts."
}
```

### Model Recommendations

If a role consistently scores below 3.0 across 3+ runs:
- Suggest upgrading the model for that role to the next tier (e.g., fast → balanced for explorer)
- Report: "Explorer agents have averaged 2.4/5 over 4 runs. Consider upgrading to a more capable model for this role."

If a role consistently scores above 4.5:
- Suggest downgrading to save cost (e.g., balanced → fast if it's overkill)
- Report: "Worker agents have averaged 4.8/5 over 6 runs. A faster/cheaper model might suffice for this project."

If token usage is disproportionate to quality:
- Report: "Business Reviewer used 45K tokens (avg) but scored 2.8/5. High cost, low value — switch model or tighten prompt."

## Second Brain Integration

If `secondBrain` is set, save performance data to the vault:

**Per-mission:** append scores to `04-implementation-log.md` or `06-audit-report.md`

**Cross-mission trends:** write `01 - Projects/<project>/agent-performance.md`:
```markdown
---
tags: [meta, performance, project/<name>]
updated: 2026-04-05
---
# Agent Performance — <project>

## Role Averages
| Role | Model | Avg Score | Avg Tokens | Total Tokens | Runs | Trend |
|---|---|---|---|---|---|---|
| Explorer | haiku | 3.8 | 11.2K | 67K | 6 | → stable |
| Worker | sonnet | 4.2 | 28.5K | 342K | 12 | ↑ improving |
| Security Reviewer | sonnet | 4.5 | 18.3K | 73K | 4 | ↑ improving |
| Business Reviewer | sonnet | 2.8 | 45.1K | 180K | 4 | ↓ declining |

## Token Budget
- Total mission tokens: 1.24M
- By phase: Architect 134K | Implement 520K | Audit 365K | Verify 89K | Other 132K
- Most expensive role: Worker (342K across 12 runs)
- Best value: Explorer (67K tokens, 3.8/5 score — efficient)
- Worst value: Business Reviewer (180K tokens, 2.8/5 score — high cost, low quality)

## Recommendations
- Business Reviewer: upgrade to a more powerful model or tighten prompt — 180K tokens for 2.8/5 is poor ROI
- Explorer: add "trace middleware chain" to prompt — recurring blind spot
- Worker: consider a faster/cheaper model for simple work items — 4.2/5 average suggests the current model may be overkill for some tasks

## Recent Scores
[last 10 entries with feedback and token usage]
```

This note becomes a living performance + cost dashboard.

---

## Gamification Appendix

### XP Formula

```
xp = round(composite * 10) + VERDICT_BONUS[verdict]
```

| Verdict | Bonus |
|---|---|
| outstanding | +20 |
| solid | +10 |
| needs_improvement | 0 |
| poor | −5 |
| failed | −10 |

Example: composite 4.2, verdict solid → round(42) + 10 = **52 XP**

### Streak Definition

`scoringStreak` increments by 1 each time a `SCORING_PHASES` phase transitions with ≥1 score logged. It resets to 0 if a scoring phase transitions with 0 scores. `longestStreak` tracks the highest value reached.

`SCORING_PHASES = { Architect, Plan, Implement, Build, Audit }` — Review Plan, Test, and Verify don't dispatch scoring-worthy subagents.

### Persona Map

See `protocol-personas.md` for the canonical role → class → emoji table.

Feed-forward templates should lead with the class vocative:

```
Scout, your last sweep scored 3.9/5. Key gap: missed the middleware chain.
Maintain your scouting pace, but this run trace the request lifecycle explicitly.
```

### Scorecard Fields

Printed to stderr at the end of the final phase transition:

| Field | Source |
|---|---|
| XP earned | `gamification.totalXp` (split: orch + user signals + rating) |
| Scoring streak | `gamification.longestStreak` |
| Verdicts | `gamification.verdictCounts` |
| Party roster | `gamification.byRole` entries with `runs` count |
| MVP | role with highest `avgComposite` (min 2 runs) |
| Needs training | role with lowest `avgComposite` (min 2 runs) |
| User signals | count of positive/negative from `userSignals` array |
| User rating | `userRating.rating` / `skipReason` |
| Total tokens | sum of `performanceLog[].usage.totalTokens` |

Career section is populated from `${XDG_CONFIG_HOME:-~/.config}/mission/profile.json` (merged at final transition).
