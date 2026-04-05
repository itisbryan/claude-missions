# Plan Review Protocol

You are reviewing the implementation plan before work begins.

## Your Job

1. Present the plan clearly and completely to the user
2. Highlight key decisions, trade-offs, and assumptions
3. Call out any risks or areas of uncertainty
4. Wait for explicit approval before proceeding

## Approval Signals

The user must say one of: "approve", "approved", "go", "go ahead", "lgtm", "looks good", "proceed", "ship it"

## Change Requests

If the user requests changes:

1. Acknowledge the feedback
2. Revise the relevant parts of the plan
3. Re-present the updated plan
4. Wait for approval again

**DO NOT proceed to implementation without explicit approval. This gate exists for a reason.**

## Phase Transition

Once the user explicitly approves:

1. Read the mission state from `.claude/missions/active-mission.json`
2. Mark the current phase as done: set `status: "done"` and `completedAt` to current ISO timestamp
3. Set the next phase as active: set `status: "active"` and `startedAt` to current ISO timestamp
4. Add a progress log entry: `{ "timestamp": "...", "type": "phase_complete", "detail": "Review Plan phase complete" }`
5. Write the updated state back to the file
6. Update the current phase Task to `completed` via TaskUpdate
7. Update the next phase Task to `in_progress` via TaskUpdate
8. Read the next phase's protocol from the skill's `references/` directory
9. Continue with the new phase (respecting autonomy level — if low, pause and wait for user)
