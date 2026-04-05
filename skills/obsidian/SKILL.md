---
name: obsidian
description: "Read and write notes to an Obsidian vault. Use when the user asks to 'save to obsidian', 'write a note', 'update my vault', 'add to second brain', 'save this research', 'document this decision', or references their knowledge base. Also triggers on /obsidian commands."
argument-hint: "[write <title> | read <query> | search <query> | daily | link <from> <to> | audit | config]"
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
| `daily` | Append to today's daily note |
| `link <from> <to>` | Add a wikilink between two notes |
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

Find and display a note by title, tag, or content.

1. **Exact match**: Glob for `**/<query>.md` in the vault
2. **Fuzzy match**: Grep for the query in filenames
3. **Content search**: Grep for the query in file contents
4. Display the note content, highlight wikilinks and tags

### `/obsidian search <query>`

Search vault content and return results.

1. Grep the vault for the query pattern
2. Return matching files with context (surrounding lines)
3. Group results by folder (Projects, Areas, Resources, etc.)
4. Show tag co-occurrence if relevant

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

## Vault-First Rule

**Before exploring code for architectural, domain, or design questions, ALWAYS search the vault first.** The vault is persistent cross-session memory. Check it before grepping the codebase — the answer may already be documented.
