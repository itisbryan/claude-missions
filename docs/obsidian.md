# /obsidian — Second Brain Vault Manager

Read, write, search, and link notes in your Obsidian vault. Works standalone or integrated with `/mission`.

## Vault Index

Run `/obsidian index` to build `.vault-index.json` — a compact lookup table (~2-5K tokens) with every note's title, tags, aliases, links, and a one-line summary.

Claude reads the index first, then fetches **only the relevant notes**:

```
User: "What's our discount engine approach?"

1. Read .vault-index.json              → 1 Read call
2. Match tagIndex["refactoring"]       → 5 notes
3. Intersect tagIndex["project/nanoco"] → 3 matches
4. Read those 3 notes                  → 3 Read calls
5. Follow one [[wikilink]]            → 1 Read call
                                        ─────────
                                        5 total reads (not 73)
```

The index auto-updates when `/obsidian write` creates or modifies notes.

## Note Types & PARA Structure

| Type | Folder | When to use |
|---|---|---|
| **Project** | `01 - Projects/` | Active work with deadlines |
| **Area** | `02 - Areas/` | Domain knowledge, ongoing responsibilities |
| **Resource** | `03 - Resources/` | External references, tools, guides |
| **Decision** | `decisions/` | Architecture/design trade-offs (ADR format) |
| **Daily** | `06 - Daily/` | Journal entry, session log |
| **Fleeting** | `05 - Fleeting/` | Quick unprocessed thought |

## TODO Tracking

```bash
/obsidian todo          # unified view: vault checkboxes + code TODOs
/obsidian todo scan     # grep codebase, save to vault as checkboxes
/obsidian todo add "x"  # quick-add to current project
```

## Mission Phase Outputs

When `secondBrain` is set, each phase auto-saves to the vault:

```
vault/missions/<mission-slug>/
├── _index.md               # Links to all phase notes
├── 01-discovery.md          # Codebase analysis findings
├── 02-plan.md               # Approved spec
├── 03-review-notes.md       # Review decisions
├── 04-implementation-log.md # Appended per work item
├── 05-test-report.md        # Test results + coverage
├── 06-audit-report.md       # Findings by severity
├── 07-verification-report.md # Final verdict
└── decisions/               # Trade-off ADRs
```

## Vault Index Schema

```json
{
  "noteCount": 73,
  "notes": {
    "path/to/note.md": {
      "title": "Note Title",
      "tags": ["backend", "architecture"],
      "aliases": ["alt name"],
      "links": ["Other Note"],
      "summary": "One-line description.",
      "updated": "2026-04-05"
    }
  },
  "tagIndex": { "backend": ["path1.md", "path2.md"] },
  "linkGraph": { "note.md": ["linked-note.md"] },
  "folderIndex": { "Projects": ["path1.md"] }
}
```

## Vault-First Rule

Before exploring code for architectural or design questions, the skill reads the index and searches the vault first — your second brain is persistent cross-session memory.
