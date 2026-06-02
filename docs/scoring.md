# Performance Scoring & Token Tracking

## Scoring Rubric

Every subagent is evaluated after it returns:

| Dimension | Weight | What it measures |
|---|---|---|
| **Quality** | 50% | Thoroughness, correctness, zero issues |
| **Completeness** | 30% | Covered everything asked, no gaps |
| **Efficiency** | 20% | Concise, focused, no wasted tokens |

`composite = (quality * 0.5) + (completeness * 0.3) + (efficiency * 0.2)`

### Verdicts

| Composite | Verdict | |
|---|---|---|
| 4.5 - 5.0 | Outstanding | 🏆 |
| 3.5 - 4.4 | Solid | 👏 |
| 2.5 - 3.4 | Needs improvement | 📝 |
| 1.5 - 2.4 | Poor | ⚠️ |
| 1.0 - 1.4 | Failed | 🔴 |

## Feedback Loop

Each score includes specific, actionable feedback passed into the next subagent's prompt:

```
High scorer (≥ 4.0):
  "Previous agents scored 4.2/5. Maintain this standard."

Low scorer (< 3.0):
  "Previous agents scored 2.1/5. Key gap: missed edge cases.
   Focus specifically on: boundary values and null inputs."

Retry after failure:
  "This item failed 2 times. Previous agent scored 1.5/5.
   You MUST address: the race condition. Do NOT repeat: the lock-based approach."
```

## Model Recommendations

After 3+ runs per role, the orchestrator tracks trends:
- Role averaging below 3.0 → suggest upgrading model (haiku → sonnet)
- Role averaging above 4.5 → suggest downgrading to save cost (sonnet → haiku)
- High tokens + low score → flag as poor ROI

## Token Tracking

Every subagent's token usage is captured from its result (`total_tokens`, `tool_uses`, `duration_ms`) and logged to `performanceLog`.

Run `node scripts/mission-state.mjs tokens` for a report:

```
## Token Usage Report

**Mission total:** 1.2M tokens across 28 subagent runs

### By Phase
| Phase     | Tokens | Runs | Avg/Run |
|-----------|--------|------|---------|
| Architect | 134K   | 4    | 33.5K   |
| Implement | 520K   | 12   | 43.3K   |
| Audit     | 365K   | 8    | 45.6K   |
| Verify    | 89K    | 4    | 22.3K   |

### By Role
| Role      | Model  | Tokens | Runs | Avg Score | Value |
|-----------|--------|--------|------|-----------|-------|
| Explorer  | haiku  | 67K    | 6    | 3.8/5     | great |
| Worker    | sonnet | 342K   | 12   | 4.2/5     | ok    |
| Biz Review| sonnet | 180K   | 4    | 2.8/5     | poor  |
```

**Value** is score-per-token ratio: `great` (> 1.5), `ok` (0.8-1.5), `poor` (< 0.8).

## Gamification

### XP Formula

```
xp = round(composite * 10) + VERDICT_BONUS
```

| Verdict | Bonus |
|---|---|
| Outstanding | +20 |
| Solid | +10 |
| Needs improvement | 0 |
| Poor | −5 |
| Failed | −10 |

Example: composite 4.2 (solid) → 42 + 10 = **52 XP**

### Streaks

A `scoringStreak` increments each time a scoring phase (Architect, Plan, Implement, Build, Audit) completes with at least one subagent scored. Resets to 0 if a scoring phase ends with no scores. `longestStreak` tracks the peak.

### Persona Classes

Each role maps to an RPG class — display-layer only, no effect on scoring math:

| Role | Class | Emoji |
|---|---|---|
| Explorer | Scout | 🔭 |
| Planner | Mage | 🧙 |
| Worker | Knight | ⚔️ |
| Security Reviewer | Rogue | 🗡️ |
| Business Reviewer | Cleric | 📜 |
| Edge Case Reviewer | Ranger | 🎯 |
| Reviewer (async/perf) | Druid | 🌿 |
| Verifier | Paladin | 🛡️ |

### Mission Scorecard

Printed at the end of the final phase. Includes: total XP, longest streak, verdict breakdown, party roster (roles + avg scores), MVP, needs-training role, user signal counts, user rating (1–5), and total tokens.

## User Signals

The orchestrator logs user feedback as `userSignals` in the state file — corrections, plan revisions, disputed choices, and approvals — each carrying a XP delta. These signals feed into the cross-mission career profile.

## Career Profile

Stored at `$XDG_CONFIG_HOME/mission/profile.json` (default `~/.config/mission/profile.json`). Merged at the end of every mission. Contains:
- Per-role averages across all missions
- Lifetime XP, verdict counts, streak records
- Saved model defaults per host tool (Claude Code, Codex, Amp, OpenCode)
- Mission history (slug, date, rating)

Run `node ~/.claude/skills/mission/scripts/mission-state.mjs load-model-defaults` to inspect saved defaults for the current tool.
