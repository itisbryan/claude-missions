# Vault Conventions

## PARA Structure

The vault follows the PARA system:

| Folder | Purpose | Lifespan |
|--------|---------|----------|
| `00 - Maps of content` | Index pages, MOCs | Evergreen |
| `01 - Projects` | Active work with deadlines | Until complete |
| `02 - Areas` | Ongoing responsibilities, domain knowledge | Long-lived |
| `03 - Resources` | External references, tools, guides | Reference |
| `04 - Permanent` | Evergreen notes, refined ideas | Forever |
| `05 - Fleeting` | Quick captures, unprocessed | Temporary |
| `06 - Daily` | Daily journal entries | Daily |
| `07 - Archives` | Completed/inactive projects | Historical |

## Frontmatter Rules

Every note MUST have:
- `id` — unique identifier (usually derived from filename)
- `tags` — array of tags following the taxonomy below

Every note SHOULD have:
- `aliases` — alternative names for linking
- `created` — creation date (YYYY-MM-DD)
- `updated` — last edit date (YYYY-MM-DD)

## Tag Taxonomy

### Domain tags
`#backend`, `#frontend`, `#ops`, `#database`, `#security`, `#devops`

### Type tags
`#architecture`, `#decision`, `#pattern`, `#reference`, `#bug-analysis`, `#refactoring`, `#tutorial`

### Project tags
`#project/<name>` — e.g., `#project/nanoco`, `#project/saas`

### Technology tags
`#rails`, `#postgres`, `#redis`, `#elasticsearch`, `#aws`, `#rust`, `#typescript`

### Status tags
`#in-progress`, `#completed`, `#blocked`, `#draft`

## Linking Rules

1. **Wikilinks only** for internal notes: `[[Note Name]]`
2. **Anchor links** for sections: `[[Note Name#Section]]`
3. **Alias links** for display: `[[Real Name|Display Text]]`
4. **External URLs** use markdown: `[text](https://...)`
5. **Every note should link to at least one other note** — no orphans
6. **Related section** at the bottom of each note with relevant wikilinks

## File Naming

- `kebab-case.md` — always lowercase, hyphens for spaces
- Max 60 characters in filename
- Type prefixes for clarity: `decision-`, `pattern-`, `guide-`, `analysis-`
- Daily notes: `YYYY-MM-DD.md`
- No special characters except hyphens

## Content Quality

- Lead with a one-sentence summary
- Use code blocks with language hints for code
- Use Mermaid for diagrams
- Use callouts for warnings/tips: `> [!warning]`, `> [!tip]`
- Keep notes focused — one concept per note, link to related concepts
- Prefer bullet points over long paragraphs
