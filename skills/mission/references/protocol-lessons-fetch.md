# Lessons Fetch — Class Feed-Forward

Before dispatching a subagent for a scored role, pull that role's class lessons and, if any exist, prepend them to the agent's prompt.

```bash
LESSONS=$(node "$MISSION_SCRIPT" lessons <Class>)
```

If `LESSONS` is not `[]`, prepend this to that agent's prompt:

```
Lessons from prior missions (<Class> has been underperforming recently):
- <lesson.text>
Keep them in mind, but focus on the work at hand.
```

Class names: **Scout** (explorer), **Mage** (planner), **Knight** (worker), **Cleric** (business_reviewer), **Rogue** (security_reviewer), **Ranger** (edge_case_reviewer), **Druid** (reviewer), **Paladin** (verifier). The `lessons` command returns `[]` unless the class has been scoring low recently (or you pass `--force`), so most runs prepend nothing.
