# Phase Transition Steps

When the current phase's completion criteria are met, follow these steps exactly:

1. Read `.claude/missions/active-mission.json`
2. Mark the current phase: `status: "done"`, `completedAt: <ISO timestamp>`
3. If a next phase exists, set it: `status: "active"`, `startedAt: <ISO timestamp>`
4. If no next phase, set mission `completedAt: <ISO timestamp>`
5. Add to `progressLog`: `{ "timestamp": "...", "type": "phase_complete", "detail": "<phase name> complete" }`
6. Write the updated state file
7. Update Tasks: current phase → `completed`, next phase → `in_progress`
8. Check autonomy level:
   - **Low**: STOP, summarize what was done, wait for user to say "continue"
   - **Medium**: Briefly summarize, continue unless user intervenes
   - **High**: Continue automatically
9. Read the next phase's protocol from `references/` and continue
