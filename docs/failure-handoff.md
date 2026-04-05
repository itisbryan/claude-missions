# Failure Escalation & Auto-Handoff

## Retry Ladder

When a subagent fails, the orchestrator follows this escalation:

```
Attempt 1 → Fix the issue, retry same approach
    ↓ fail
Attempt 2 → Revert, try a different approach
    ↓ fail
Attempt 3 → Revert, spawn fresh subagent (clean context)
    ↓ fail
Escalate  → Spawn Opus debug agent with full failure log
    ↓ fail
Handoff   → Auto-generate handoff.md, pause mission
```

## Guards Against Infinite Loops

- **Per-session ceiling:** 3 attempts + 1 Opus escalation per work item
- **Cross-session ceiling:** 6 total attempts across ALL sessions. After 6 → HARD STOP, ask user
- **Autonomy override:** Failure escalation always pauses, even on High autonomy
- **Single writer:** Only the orchestrator writes to state — prevents race conditions

## What Gets Logged

Every attempt is saved to `failureLog` in the state file:

```json
{
  "workItem": "feature 1.1",
  "attempts": [
    { "attempt": 1, "session": 1, "approach": "...", "error": "...", "timestamp": "..." },
    { "attempt": 2, "session": 1, "approach": "...", "error": "...", "timestamp": "..." }
  ],
  "totalAttempts": 2,
  "escalatedTo": null,
  "resolved": false
}
```

## Auto-Handoff

When Opus debug also fails, the orchestrator automatically:

1. Generates `.claude/missions/handoff.md` with full context:
   - Mission config, phase status, approved plan
   - Complete failure log (what was tried, what failed)
   - Files changed (git diff stat)
   - Context notes for the next session
2. Pauses the mission
3. Informs the user

## Resuming After Handoff

New session runs `/mission` → orchestrator reads:
1. `active-mission.json` — where was I?
2. `handoff.md` — what was tried, what failed?
3. `failureLog` — how many total attempts? (don't exceed 6)

The handoff.md is consumed (deleted) after reading.

## Manual Handoff

Force a handoff at any time:

```bash
/mission handoff
```

## Compaction Resilience

The orchestrator re-reads state before every decision. Even if 100% of conversation context is compacted:

- `node scripts/mission-state.mjs status` — know where you are
- `node scripts/mission-state.mjs get failureLog` — know what failed
- `node scripts/mission-state.mjs get performanceLog` — know past scores

The state file is the single source of truth, not conversation memory.
