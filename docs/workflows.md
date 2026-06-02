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

## 4. Cross-session handoff

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
