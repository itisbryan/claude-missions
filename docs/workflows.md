# Workflows

## 1. Full standard mission

The flagship workflow — a structured six-phase feature build.

```bash
# Start a mission — pick a template, accept the model defaults
/mission build a discount engine for the checkout service
# → Template: Feature
# → Model Assignment: defaults (Haiku 4.5 scouting, Sonnet workers/reviewers, Opus planning)

# Claude runs through all 6 phases automatically:
# 📐 Architect → parallel Haiku scouts map the codebase, then a spec is written
# 👁️ Review → you approve the plan
# 🔨 Implement → parallel workers build it
# 🧪 Test → writes and runs tests
# 🔍 Audit → specialist reviewers check everything (Async/Perf gated by scope)
# ✅ Verify → validates against the spec
```

## 2. Quick bug fix

Minimal mode with regression-test-first discipline.

```bash
/mission fix the race condition in payment processing
# → Template: Bug Fix (auto-sets Minimal mode, Low autonomy)

# 3 phases:
# 📋 Plan → reproduce bug, find root cause, propose fix
# 🔨 Build → write failing test first, then fix, confirm test passes
# ✅ Verify → full test suite + linter
```

## 3. Research spike

Explore a question and produce a report — no production code.

```bash
/mission evaluate whether we should migrate from Redis to Valkey
# → Template: Investigation (Minimal mode, High autonomy)

# Claude explores, writes throwaway code to test hypotheses,
# then presents a structured findings report
```

## 4. Vault-powered development (no mission)

Use `/obsidian` standalone to leverage your second brain during regular coding.

```bash
# Before writing code, check what you already know
/obsidian search "authentication"
# → Claude reads the index, finds 3 relevant notes, shows summaries

# Read a specific note for context
/obsidian read decision-auth-strategy
# → Shows the full ADR with context, options, and decision

# Save what you learned during a coding session
/obsidian write pattern-retry-with-backoff
# → Creates an Area note in 02 - Areas/ with proper frontmatter and tags

# Document a key decision
/obsidian write decision-use-redis-for-sessions
# → Creates an ADR in decisions/ with options, trade-offs, consequences

# End of day — capture session context
/obsidian daily
# → Appends a summary to today's daily note (06 - Daily/2026-04-05.md)

# Check vault health periodically
/obsidian audit
# → Reports broken links, orphan notes, stale in-progress items
```

## 5. Cross-session handoff

When a mission gets complex or you need to continue tomorrow.

```bash
# Session 1: start a big mission
/mission refactor the entire payment module
# → Works through Architect, Review, starts Implement...
# → A work item fails 3 times, Opus debug also fails
# → Orchestrator auto-generates handoff.md, pauses mission

# Session 2 (next day): pick up where you left off
/mission
# → Reads state + handoff.md automatically
# → Shows: "Mission paused. Work item 'extract payment gateway' failed 4 times."
# → You decide: skip it, fix manually, or let Claude retry with fresh context
```

## 6. Track TODOs across code and vault

Keep work items in sync between your codebase and your second brain.

```bash
# See all open items — vault checkboxes + code TODOs in one view
/obsidian todo
# → Vault: 12 open items across 4 notes
# → Codebase: 5 TODOs, 2 FIXMEs
# → Priority: 2 FIXMEs should be addressed first

# Scan code and save TODO/FIXME/HACK comments to your vault
/obsidian todo scan
# → Writes 01 - Projects/<project>/code-todos.md
# → Grouped by type: FIXME (fix first) → TODO → HACK
# → Each item is a checkbox you can track in Obsidian

# Add a quick todo
/obsidian todo add "review the caching strategy before launch"
# → Adds to the current project note as a checkbox
```

## 7. Index your vault for Claude to learn from

Turn your existing Obsidian vault into a knowledge base that Claude can query efficiently.

```bash
# Build the index (do this once, then periodically)
/obsidian index
# → Scans 73 notes in ~/Documents/niin2brain
# → Builds .vault-index.json (tags, summaries, links)

# Now Claude can answer questions from your vault
"What patterns do we use for error handling?"
# → Claude reads index (1 call), finds 3 matching notes (3 calls)
# → Total: 4 reads instead of 73

"How did we decide on the discount engine architecture?"
# → Index lookup: tagIndex["project/nanoco"] ∩ tagIndex["architecture"]
# → Finds: Executive Summary, Design Systems, Refactoring Plan
# → Reads those 3 notes, follows [[links]] to Performance Projection
# → Gives you a complete answer from YOUR prior research
```
