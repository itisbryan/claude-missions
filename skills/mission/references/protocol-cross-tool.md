# Cross-Tool Portability Conventions

Conventions that make the mission skill work across Claude Code, Codex, OpenCode, Amp, and Windows hosts.

## `MISSION_SCRIPT` Environment Variable

Every protocol instruction that invokes `mission-state.mjs` uses `$MISSION_SCRIPT`:

```bash
node "$MISSION_SCRIPT" score-batch '[...]'
```

**Default (Claude Code):** `~/.claude/skills/mission/scripts/mission-state.mjs`

Each tool sets this variable to its own install location:
- Claude Code: set in shell profile or `.claude/settings.json` env block
- Codex / OpenCode / Amp: set in the tool's startup environment

If `$MISSION_SCRIPT` is unset in your shell, substitute the Claude Code default path directly:

```bash
node ~/.claude/skills/mission/scripts/mission-state.mjs score-batch '[...]'
```

## `MISSION_PROFILE_PATH` Environment Variable

Overrides the cross-mission profile location. Defaults to `~/.claude/mission-profile.json` (resolved via `os.homedir()` — portable across Windows and Unix).

```bash
MISSION_PROFILE_PATH=/custom/path/profile.json node "$MISSION_SCRIPT" profile
```

`os.homedir()` returns `%USERPROFILE%` on Windows and `$HOME` on Unix — no manual path translation needed.

## AskUserQuestion Fallback

For any prompt that requires user input (end-of-mission rating, work-item thumbs 👍/👎):

- **Claude Code:** use the `AskUserQuestion` tool — provides a structured UI.
- **Codex / OpenCode / Amp (no AskUserQuestion):** print the question and options as plain text, then STOP. Wait for the user's reply. Do NOT pick a default silently.

Example fallback format:
```
Rate this mission 1–5. Optional: add a one-line comment.
  1 — poor   2 — below average   3 — average   4 — good   5 — excellent
Reply with a number (and optional comment after a space).
```

This mirrors the SKILL.md fallback pattern and ensures no silent defaults.

## Subagent Dispatch Syntax

Scoring steps in protocol files score outputs — they do not dispatch subagents. The scoring step is tool-agnostic and only runs `node "$MISSION_SCRIPT" score-batch '[...]'` after the subagents have already returned.

Protocol files use the notation:
> **Dispatch note:** Claude Code: `subagent_type: "Explore"` or `"general-purpose"`; Codex/OpenCode/Amp: use your tool's equivalent agent mode.

No new scoring step assumes Claude Code's `subagent_type` keyword.

## Summary

| Convention | Variable / Pattern | Default |
|---|---|---|
| Script location | `$MISSION_SCRIPT` | `~/.claude/skills/mission/scripts/mission-state.mjs` |
| Profile location | `$MISSION_PROFILE_PATH` | `~/.claude/mission-profile.json` |
| Interactive prompts | AskUserQuestion or plain-text STOP | Plain-text STOP if tool lacks the tool |
| Subagent dispatch | Tool-native mechanism | See each protocol's dispatch note |
