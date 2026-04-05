# Phase Transition Steps

When the current phase's completion criteria are met, follow these steps exactly:

1. Read `.claude/missions/active-mission.json`
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
   - **Low**: STOP, summarize what was done, wait for user to say "continue"
   - **Medium**: Briefly summarize, continue unless user intervenes
   - **High**: Continue automatically
9. Read the next phase's protocol from `references/` and continue

## Guards

- **Missing state file**: Report error, suggest `/mission reset`
- **Invalid JSON**: Report parse error, suggest `/mission reset`
- **No active phase found**: Report inconsistent state, suggest `/mission status` then `/mission reset`
- **Phase index out of bounds**: Treat as final phase (set mission completedAt)
