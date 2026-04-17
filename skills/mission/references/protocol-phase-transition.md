# Phase Transition Steps

When the current phase's completion criteria are met, follow these steps exactly.

**Prefer using the script** for steps 1-6: `node scripts/mission-state.mjs phase-transition` — this handles all state updates atomically and is compaction-safe (no conversation context needed).

If the script is unavailable, do it manually:

1. Read `.missions/active-mission.json`
   - If the file is missing or contains invalid JSON, report the error and suggest `/mission reset`
2. Find the current active phase in the `phases` array
3. Mark it: `status: "done"`, `completedAt: <ISO timestamp>`
4. **Check if this is the last phase:**
   - If there is a next phase → set it: `status: "active"`, `startedAt: <ISO timestamp>`
   - If there is NO next phase → this is the final phase:
     - Set `completedAt` on the mission state itself
     - Use `"type": "mission_complete"` in the progress log (not `phase_complete`)
     - Skip steps 7-9 below — present a final mission summary instead
5. Add to `progressLog`: `{ "timestamp": "...", "type": "phase_complete", "detail": "<phase name> complete" }`
6. Write the updated state file
7. Update Tasks: current phase → `completed`, next phase → `in_progress`
8. Check autonomy level:
   - **Low**: STOP. Summarize what was done. Wait for the user to say "continue", "next", or "go". Do not proceed without an explicit reply.
   - **Medium**: STOP. Output a 3-line summary. Ask "Ready to enter [next phase]? Reply 'continue' to proceed." Do not proceed without an explicit reply.
   - **High**: Continue automatically. Do not pause unless a hard failure or the failure-override conditions in `autonomy-levels.md` are met.
9. Read the next phase's protocol from `references/` and continue

## Guards

- **Missing state file**: Report error, suggest `/mission reset`
- **Invalid JSON**: Report parse error, suggest `/mission reset`
- **No active phase found**: Report inconsistent state, suggest `/mission status` then `/mission reset`
- **Phase index out of bounds**: Treat as final phase (set mission completedAt)

---

## Gamification & User Signal Integration

The `phase-transition` script command automatically handles gamification output — the orchestrator does not need to do anything extra.

### What happens on every phase transition

When you run `node "$MISSION_SCRIPT" phase-transition`:

- If the phase is a `SCORING_PHASES` phase (`Architect`, `Plan`, `Implement`, `Build`, `Audit`) and scores were logged → prints 🎉 praise to stderr: avg score, verdict badges, party composition, XP earned, streak, per-role trend deltas.
- If the phase is a `SCORING_PHASES` phase and **no scores were logged** → prints ⚠️ complaint to stderr and resets streak to 0. This is a warning only — the transition still proceeds.
- Non-scoring phases (`Review Plan`, `Test`, `Verify`) — no gamification output.

### User signal gates (autonomy-aware)

Only one set of signals fires per mission, determined by autonomy level:

| Level | Signal | When |
|---|---|---|
| **Medium** | `phase_approved` (+5 split across phase roster) | User types "continue" at phase gate → `node "$MISSION_SCRIPT" user-signal '{"role":"<dominant role>","phase":"<name>","type":"phase_approved"}'` |
| **High** | `silent_run` (+10 per class, auto-emitted) | Auto-computed at final transition if zero negative signals — script handles this internally |
| **Low** | `work_item_thumbs_up/down` | Per work item in Implement/Build — see protocol-implementation.md |

Do not fire cross-level signals — `phase_approved` does not fire on Low or High; `silent_run` does not fire on Low or Medium; thumbs signals do not fire on Medium or High.

### Final phase handling

On the final phase transition, the script automatically:
1. Emits `silent_run` signals (High autonomy only, zero negative signals)
2. Merges the mission's `gamification` block into `${XDG_CONFIG_HOME:-~/.config}/mission/profile.json`
3. Prints the Mission Scorecard to stderr

**Orchestrator responsibility for Low/Medium autonomy:** Before calling `phase-transition` on the final phase, prompt the user for a 1–5 mission rating:
- Claude Code: use AskUserQuestion with options 1–5 and an optional comment field
- Other tools: print the question as plain text and STOP (see `protocol-cross-tool.md`)

Then call: `node "$MISSION_SCRIPT" rate-mission '{"rating": <1-5>, "comment": "<optional>"}'`

For High autonomy: `node "$MISSION_SCRIPT" rate-mission '{"skipReason":"high_autonomy"}'`

After `rate-mission`, call `phase-transition` — the scorecard will reflect the rating.
