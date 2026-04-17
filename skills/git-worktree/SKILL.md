---
name: git-worktree
description: Create an isolated git worktree with dev/test environment ready. Auto-invoked by /mission before Phase 1; supports manual use for parallel development.
---

## What / When

Use this skill to create an isolated branch and worktree for any development task — especially missions. The `/mission` skill invokes it automatically before Phase 1 (skippable). Invoke manually with `/git-worktree` when you need parallel isolation outside a mission.

**CRITICAL**: Never call `git worktree add` directly. Always invoke via the script below.

## Commands

| Command | Description |
|---|---|
| `create <branch> [--from <base>] [--no-setup]` | Create worktree at `.worktrees/<branch>/`, auto-install deps |
| `list` / `ls` | Show all worktrees with color-coded table |
| `cleanup` / `clean` | Interactively remove worktrees under `.worktrees/` |
| `setup [path]` | Re-run post-create setup on an existing worktree (default: cwd) |
| `help` | Print usage |

## Invocation

```bash
node ${CLAUDE_PLUGIN_ROOT:-.}/skills/git-worktree/scripts/worktree-manager.mjs <cmd> [args]
```

## Integration with /mission

When `/mission` starts, it runs:

```bash
node ${CLAUDE_PLUGIN_ROOT:-.}/skills/git-worktree/scripts/worktree-manager.mjs \
  create mission/<mission-slug>
```

Parse the trailing JSON line to get the worktree path:

```json
{"worktreePath": "/abs/path/.worktrees/mission/<slug>", "branch": "mission/<slug>"}
```

Store `worktreePath` in the mission state file. All subsequent phase commands run with `cwd: worktreePath`.

If the user declines worktree isolation (via the autonomy/constraints question or `--no-setup`), skip this step and operate on the current branch.

## Output contract

On `create`, the script always emits a final JSON line to stdout:

```json
{"worktreePath": "<absolute-path>", "branch": "<branch-name>"}
```

Callers must parse this line (last line of stdout) to obtain the path.

## Safety

- Refuses to run outside a git repo
- Rejects branch names containing `..` (path-traversal guard)
- `cleanup` never removes the current working worktree
- Installer failures are non-fatal — worktree remains usable with a warning
