# Workflows

## 1. Full mission with vault documentation

The most powerful workflow — run a structured mission and save everything to your second brain.

```bash
# First time: set up your vault
/obsidian config
# → provide your Obsidian vault path (e.g., ~/Documents/niin2brain)

# Build the vault index so Claude can learn from your existing notes
/obsidian index

# Start a mission — select a template, set vault as second brain
/mission build a discount engine for the checkout service
# → Template: Feature
# → Second Brain: ~/Documents/niin2brain
# → Model Assignment: defaults

# Claude runs through all 6 phases automatically:
# 📐 Architect → reads your vault first for prior decisions and patterns
# 👁️ Review → you approve the plan
# 🔨 Implement → parallel workers build it
# 🧪 Test → writes and runs tests
# 🔍 Audit → 5 specialist reviewers check everything
# ✅ Verify → validates against the spec

# Every phase saves outputs to your vault:
# vault/missions/build-discount-engine/01-discovery.md
# vault/missions/build-discount-engine/02-plan.md
# vault/missions/build-discount-engine/decisions/decision-001.md
# ...etc
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

## 3. Research spike with vault output

Explore a question and save findings — no production code.

```bash
/mission evaluate whether we should migrate from Redis to Valkey
# → Template: Investigation (Minimal mode, High autonomy)
# → Second Brain: ~/Documents/niin2brain

# Claude explores, writes throwaway code to test hypotheses,
# then saves a structured report to your vault as a Resource note
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

# After a mission — implementation phase auto-scans for leftover TODOs
/mission build a notification system
# → During Implement phase, after all work items:
# →   "Found 3 TODOs and 1 FIXME in changed files"
# →   Auto-saved to vault if secondBrain is set
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
