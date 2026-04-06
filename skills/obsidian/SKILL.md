---
name: obsidian
description: "Read and write notes to an Obsidian vault. Use when the user asks to 'save to obsidian', 'write a note', 'update my vault', 'add to second brain', 'save this research', 'document this decision', or references their knowledge base. Also triggers on /obsidian commands."
argument-hint: "[write <title> | read <query> | search <query> | todo | daily | link <from> <to> | index | audit | config]"
---

# Obsidian — Second Brain Vault Manager

Read, write, search, and link notes in an Obsidian vault directly from Claude Code. Works with any vault directory — no plugins or MCP servers required.

## Vault Discovery

Find the vault path in this order:
1. Check `secondBrain` field in `.claude/missions/active-mission.json` (if a mission is active)
2. Check for `.obsidian-vault` file in the project root (contains the vault path)
3. Check environment variable `OBSIDIAN_VAULT`
4. Ask the user with AskUserQuestion: "Where is your Obsidian vault? Provide the absolute path."

Once found, validate: the directory must exist and contain a `.obsidian/` folder. Store the path for the rest of the session.

## Argument Routing

<arguments>$ARGUMENTS</arguments>

| Argument | Action |
|----------|--------|
| `write <title>` | Create or update a note |
| `read <query>` | Find and display a note |
| `search <query>` | Search vault content |
| `todo` | Show all open todos across vault + code |
| `todo scan` | Scan codebase for TODO/FIXME and save to vault |
| `todo add <item>` | Add a todo to the current project note |
| `daily` | Append to today's daily note |
| `link <from> <to>` | Add a wikilink between two notes |
| `index` | Rebuild the vault index for fast lookup |
| `audit` | Check vault health (broken links, orphans, stale notes) |
| `config` | Set vault path and preferences |
| *(no args)* | Show vault summary (note count, recent notes, graph stats) |

---

## Commands

### `/obsidian write <title>`

Create or update a note. Determines the note type and applies the correct template.

**Step 1 — Classify the note type:**

| Type | When to use | Folder | Template |
|------|-------------|--------|----------|
| **Project** | Active work, features, tasks | `01 - Projects/<project>/` | `references/templates/project-note.md` |
| **Area** | Domain knowledge, patterns, practices | `02 - Areas/<area>/` | `references/templates/area-note.md` |
| **Resource** | External references, tools, guides | `03 - Resources/<category>/` | `references/templates/resource-note.md` |
| **Decision** | Architecture/design trade-off | `01 - Projects/<project>/decisions/` | `references/templates/decision-adr.md` |
| **Daily** | Today's journal entry | `06 - Daily/` | `references/templates/daily-note.md` |
| **Fleeting** | Quick idea, unprocessed thought | `05 - Fleeting/` | minimal frontmatter |

If the type is ambiguous, ask the user with AskUserQuestion.

**Step 2 — Build the note:**
- Read the appropriate template from `references/templates/`
- Fill in frontmatter (title, tags, date, aliases)
- Write the content body
- Add `[[wikilinks]]` to related existing notes (search vault for connections)
- Use kebab-case filename: `my-note-title.md`

**Step 3 — Write the file:**
- If the note already exists, read it first and merge content (append or update sections)
- Create parent directories if needed
- Write the file to the vault

**Step 4 — Link back:**
- Search for existing notes that should reference this new note
- Suggest links but do NOT auto-edit other notes without user confirmation

### `/obsidian read <query>`

Find and display a note. Uses the index for fast lookup.

1. Read `.vault-index.json`
2. **Match by title/alias** — scan `notes` for matching `title` or `aliases`
3. **Match by tag** — check `tagIndex` if query looks like a tag
4. **Fallback** — Glob for `**/<query>.md` if index has no match
5. Read and display the matched note
6. Show its outgoing `[[wikilinks]]` as related notes the user can explore

### `/obsidian search <query>`

Search vault content. Index first, grep only if needed.

1. Read `.vault-index.json`
2. **Search summaries** — scan `summary` fields for the query keyword
3. **Search tags** — check `tagIndex` for matching tags
4. **If <3 results from index** — fall back to Grep across vault content
5. Return matching files grouped by PARA folder
6. Show match count and suggest reading specific notes

### `/obsidian todo`

Aggregate all open work items from both the vault and the codebase into a single dashboard.

**Step 1 — Collect from vault:**
Grep all `.md` files in the vault for unchecked items: `- [ ]`
Extract each item with its source file path and any surrounding context (parent heading).

**Step 2 — Collect from codebase:**
Grep the project directory for code comments matching these patterns:
- `TODO:` or `TODO(`
- `FIXME:` or `FIXME(`
- `HACK:` or `HACK(`
- `XXX:` or `XXX(`
- `@todo`

Extract each item with file path, line number, and the comment text.

**Step 3 — Display dashboard:**

```
## Open Work Items

### Vault (12 items)

#### 01 - Projects/Nanoco/Ampo/plan.md
- [ ] Implement phase 2 discount rules
- [ ] Add performance benchmarks

#### 06 - Daily/2026-04-05.md
- [ ] Review PR #42
- [ ] Update deployment docs

### Codebase (5 items)

#### src/services/payment.ts
- L45: TODO: handle refund edge case when partial payment
- L128: FIXME: race condition on concurrent checkout

#### src/models/discount.rb
- L23: TODO(bryan): validate discount stacking rules

### Summary
- Vault: 12 open | Codebase: 5 TODOs, 2 FIXMEs
- Priority: 2 FIXMEs should be addressed first
```

### `/obsidian todo scan`

Scan the codebase for TODO/FIXME comments and create a vault note tracking them.

1. Grep the project for `TODO:`, `FIXME:`, `HACK:`, `XXX:` patterns
2. Group by file, classify by type (todo/fixme/hack)
3. Write or update `01 - Projects/<project>/code-todos.md` in the vault:

```markdown
---
id: code-todos
tags: [project/<name>, todo, tracking]
created: 2026-04-05
updated: 2026-04-05
---

# Code TODOs — <project name>

> Auto-generated by `/obsidian todo scan`. Last scanned: 2026-04-05.

## FIXME (fix first)
- [ ] `src/services/payment.ts:128` — race condition on concurrent checkout
- [ ] `src/utils/cache.ts:45` — memory leak on reconnect

## TODO
- [ ] `src/services/payment.ts:45` — handle refund edge case
- [ ] `src/models/discount.rb:23` — validate discount stacking rules
- [ ] `src/api/routes.ts:89` — add rate limiting

## HACK (technical debt)
- [ ] `src/workers/sync.ts:12` — temporary workaround for API timeout

## Summary
- 2 FIXMEs | 3 TODOs | 1 HACK
- Scanned: 142 files
```

4. Update the vault index with the new/updated note
5. If a mission is active, add any FIXMEs as blockers to the mission progressLog

### `/obsidian todo add <item>`

Add a todo item to the appropriate place.

1. If a mission is active, add to the current phase's work items
2. If no mission, add to the current project note (ask which project if ambiguous)
3. If `secondBrain` is set, also add to the project's vault note
4. Format: `- [ ] <item>` with today's date

### `/obsidian daily`

Append to today's daily note.

1. Find or create today's note at `06 - Daily/YYYY-MM-DD.md`
2. If creating, use the daily note template from `references/templates/daily-note.md`
3. Append the content under an `## Updates` or `## Notes` heading with a timestamp
4. Content can come from:
   - Mission progress (if a mission is active, summarize current state)
   - Conversation context (what was discussed/decided)
   - User-provided text

### `/obsidian link <from> <to>`

Add a wikilink between two notes.

1. Find both notes in the vault
2. Add `[[to]]` as a link in the `from` note (in a `## Related` section or inline)
3. Report the link was created

### `/obsidian index`

Rebuild the vault index at `<vault>/.vault-index.json`. This is a compact lookup table that lets Claude find relevant notes without reading every file.

**Step 1 — Scan every `.md` file in the vault** (skip `.obsidian/` and `node_modules/`)

For each note, extract:
- `path` — relative path from vault root
- `title` — H1 heading or filename
- `tags` — from frontmatter `tags` array
- `aliases` — from frontmatter `aliases` array
- `links` — all `[[wikilinks]]` found in the content
- `summary` — first non-empty paragraph after H1 (max 120 chars)
- `updated` — file modification date
- `folder` — PARA category (`Projects`, `Areas`, `Resources`, etc.)

**Step 2 — Build reverse indexes:**

```json
{
  "generated": "2026-04-05T10:00:00Z",
  "noteCount": 73,
  "notes": {
    "01 - Projects/Nanoco/Ampo/Refactoring/plan.md": {
      "title": "Refactoring Plan",
      "tags": ["project/nanoco", "refactoring", "architecture"],
      "aliases": ["ZK10 Plan"],
      "links": ["Design Systems", "Performance Projection"],
      "summary": "Phase-by-phase plan for discount engine refactoring with 4 phases.",
      "updated": "2026-03-31",
      "folder": "Projects"
    }
  },
  "tagIndex": {
    "backend": ["02 - Areas/backend/wide_event.md"],
    "project/nanoco": ["01 - Projects/Nanoco/Ampo/Refactoring/plan.md", "..."]
  },
  "linkGraph": {
    "plan.md": ["design-systems.md", "performance-projection.md"],
    "design-systems.md": ["plan.md", "pure-evaluator-pattern.md"]
  },
  "folderIndex": {
    "Projects": ["path1.md", "path2.md"],
    "Areas": ["path3.md"],
    "Resources": ["path4.md"]
  }
}
```

**Step 3 — Write `.vault-index.json` to vault root.**

**When to rebuild:**
- Run `/obsidian index` explicitly
- Auto-rebuild when `/obsidian write` creates or updates a note (incremental — update only the changed entry, don't rescan everything)
- Suggest rebuilding if the index is older than 7 days

### `/obsidian audit`

Check vault health and suggest improvements.

1. **Broken links**: Find `[[wikilinks]]` that point to non-existent notes
2. **Orphan notes**: Notes with zero incoming or outgoing links
3. **Stale notes**: Notes not modified in 90+ days that have `#in-progress` tags
4. **Tag inconsistencies**: Similar tags that should be merged (e.g., `#backend` and `#back-end`)
5. **Empty notes**: Notes with only frontmatter and no content
6. Report findings with suggested fixes

### `/obsidian config`

Set or update vault configuration.

1. Ask for vault path
2. Write to `.obsidian-vault` in the project root: `vault: <path>`
3. Optionally save to memory for future sessions

---

## Writing Conventions

Follow these rules when writing any note. Read `references/conventions.md` for details.

### Frontmatter
```yaml
---
id: <unique identifier derived from filename>
aliases: [<alt names>]
tags: [<domain>, <type>, <topic>]
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
---
```

### Links
- Use `[[wikilinks]]` for internal vault links — never markdown `[text](path)` for internal notes
- Use `[[Note Name#Section|Display Text]]` for anchored/aliased links
- Use standard markdown `[text](url)` only for external URLs
- **Prefer linking over duplicating** — if a concept exists, link to it

### Tags
Follow the vault's existing tag taxonomy. Common patterns:
- Domain: `#backend`, `#frontend`, `#ops`, `#database`
- Type: `#architecture`, `#decision`, `#pattern`, `#reference`
- Project: `#project/<name>`
- Status: `#in-progress`, `#completed`, `#blocked`

### File Naming
- kebab-case: `my-note-title.md`
- Type prefixes when useful: `decision-auth-strategy.md`, `pattern-wide-events.md`
- Daily notes: `YYYY-MM-DD.md`

### Content Structure
1. H1 title (matches frontmatter title)
2. Brief overview paragraph
3. Structured content with H2/H3 headings
4. `## Related` section at the bottom with wikilinks

---

## Integration with /mission

When a mission has `secondBrain` set, the mission protocols use this skill's conventions to write phase outputs. The `/obsidian` skill can also be used standalone without a mission.

To connect a mission to your vault:
1. Set `secondBrain` in mission setup (Question 6)
2. Or run `/obsidian config` to set the vault path, then start a mission

---

## Index-First Lookup (Token Optimization)

**Never read every note in the vault.** Always use the index for efficient lookup:

1. **Read `.vault-index.json`** (~2-5K tokens for a 100-note vault)
2. **Query the index** — match by tag, title, alias, or summary text
3. **Read only the matching notes** — typically 1-5 files instead of 100
4. **Follow links** — if a note links to related notes, read those too (1 hop max)

### Lookup Strategy

| Query type | How to find notes |
|---|---|
| By topic | Search `tagIndex` for matching tags |
| By name | Search `notes` keys and `title`/`aliases` fields |
| By keyword | Search `summary` fields in the index first, then `Grep` the vault only if no index match |
| By project | Search `folderIndex.Projects` |
| By relationship | Follow `linkGraph` from a known note |

### Example

User asks: "What's our approach to discount engine refactoring?"

1. Read `.vault-index.json` (one Read call)
2. Search: `tagIndex["refactoring"]` → finds 5 notes
3. Search: `tagIndex["project/nanoco"]` → finds 12 notes  
4. Intersect: 3 notes match both → read those 3 files (three Read calls)
5. Follow links: one note links to `[[Performance Projection]]` → read that too
6. **Total: 5 Read calls instead of 73**

### If the Index Is Missing

If `.vault-index.json` doesn't exist:
1. Warn: "Vault index not found. Building it now..."
2. Run the index build (same as `/obsidian index`)
3. Then proceed with the lookup

### If the Index Is Stale

If the index `generated` timestamp is older than 7 days:
1. Warn: "Vault index is [N] days old. Results may be incomplete."
2. Proceed with the stale index (still faster than no index)
3. Suggest: "Run `/obsidian index` to rebuild."

## Scripts (Token Optimization)

Use these scripts via Bash for deterministic operations instead of doing the work yourself:

| Script | What it does | Tokens saved |
|---|---|---|
| `~/.claude/skills/obsidian/scripts/vault-index.mjs <vault>` | Build `.vault-index.json` — scans all files, extracts frontmatter, builds tag/link indexes | Avoids reading every note (~50-100K tokens for large vaults) |
| `~/.claude/skills/obsidian/scripts/todo-scan.mjs [dir] [--vault <path>]` | Grep for TODO/FIXME/HACK, format output, optionally write to vault | Avoids LLM grepping + formatting (~5-10K tokens) |
| `~/.claude/skills/obsidian/scripts/vault-audit.mjs <vault>` | Check broken links, orphans, empty notes, stale items | Avoids reading every note + checking links (~50K tokens) |

**Always prefer scripts over manual work.** The LLM should focus on reasoning (what to write, what decisions to make) — not on scanning, counting, or formatting.

### When to use scripts vs. LLM

| Task | Use script | Use LLM |
|---|---|---|
| Build vault index | `vault-index.mjs` | — |
| Scan for TODOs | `todo-scan.mjs` | — |
| Audit vault health | `vault-audit.mjs` | Interpret results, suggest fixes |
| Write a note | — | Classify type, generate content, add links |
| Search vault | Read `.vault-index.json` | Interpret results, decide what to read |
| Phase transition | `mission-state.mjs phase-transition` | — |
| Score a subagent | `mission-state.mjs score` | Evaluate quality, write feedback |

## Vault-First Rule

**Before exploring code for architectural, domain, or design questions, ALWAYS search the vault first.** Use the index to find relevant notes in 1-2 Read calls. The vault is persistent cross-session memory — the answer may already be documented.
