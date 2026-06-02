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

**User signal hooks at this boundary (run after the user responds):**
- User requests any revision: `node "$MISSION_SCRIPT" user-signal '{"role":"planner","phase":"Review Plan","type":"plan_revision","context":"<brief description of requested change>"}'`
- User approves on the **first try** (no revision requests were made during this Review Plan phase): `node "$MISSION_SCRIPT" user-signal '{"role":"planner","phase":"Review Plan","type":"approval_first_try"}'`

Run only the matching signal — not both.

**DO NOT proceed to implementation without explicit approval. This gate exists for a reason.**

## Phase Transition

Once the user approves, follow the steps in `references/protocol-phase-transition.md`.
