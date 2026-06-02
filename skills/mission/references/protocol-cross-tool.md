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

Overrides the cross-mission profile location. Defaults to `${XDG_CONFIG_HOME:-~/.config}/mission/profile.json` (resolved via `process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')` — portable on macOS, Linux, and Windows).

```bash
MISSION_PROFILE_PATH=/custom/path/profile.json node "$MISSION_SCRIPT" profile
```

**Legacy migration:** On first read, if the new XDG path is missing but `~/.claude/mission-profile.json` exists, the profile is automatically copied to the new path. The legacy file is left untouched so rollback is trivial.

## Host-Tool Detection

Run `node "$MISSION_SCRIPT" detect-tool` at mission start. The script checks env vars in priority order:

1. `$CLAUDECODE=1` → `claude-code`
2. any `$CODEX_*` env var → `codex`
3. `$AMP_API_KEY` or any `$AMP_*` env var → `amp`
4. any `$OPENCODE_*` env var → `opencode`
5. cached `detectedTool` in profile (if <30 days old and not contradicted) → use cache
6. nothing matched → `unknown` (ask user)

Once confirmed, persist with `node "$MISSION_SCRIPT" detect-tool --confirm <tool>`.

## Profile Schema (v2)

The cross-tool profile at `${XDG_CONFIG_HOME:-~/.config}/mission/profile.json` now includes two new top-level keys alongside existing gamification fields:

```json
{
  "version": 2,
  "detectedTool": "claude-code",
  "toolDetectedAt": "<ISO timestamp>",
  "modelDefaults": {
    "claude-code": {
      "explorer": "claude-haiku-4-5-20251001",
      "planner": "claude-opus-4-8",
      "worker": "claude-sonnet-4-6",
      "business_reviewer": "claude-sonnet-4-6",
      "security_reviewer": "claude-sonnet-4-6",
      "edge_case_reviewer": "claude-sonnet-4-6",
      "reviewer": "claude-sonnet-4-6",
      "verifier": "claude-sonnet-4-6"
    },
    "codex": { "explorer": "gpt-4o-mini", "planner": "o3", "worker": "gpt-4o", ... },
    "amp": { "_note": "user-supplied model names" },
    "opencode": { "_note": "user-supplied; provider-agnostic" }
  }
}
```

Use `node "$MISSION_SCRIPT" load-model-defaults [--tool <tool>]` to read the map for a tool, and `save-model-defaults '<json>' [--tool <tool>]` to update it.

> **Pin full, dated model IDs** (`claude-haiku-4-5-20251001`, `claude-opus-4-8`, `claude-sonnet-4-6`) rather than short aliases. Aliases and dateless IDs can resolve to a stale snapshot via Claude Code issue #25588 — for a cost-optimizer that matters, because the Scout (explorer) must deterministically land on current Haiku 4.5. For Codex/Amp/OpenCode, use whatever exact identifier your provider pins.

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
| Profile location | `$MISSION_PROFILE_PATH` | `${XDG_CONFIG_HOME:-~/.config}/mission/profile.json` |
| Interactive prompts | AskUserQuestion or plain-text STOP | Plain-text STOP if tool lacks the tool |
| Subagent dispatch | Tool-native mechanism | See each protocol's dispatch note |
