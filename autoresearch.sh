#!/bin/bash
set -euo pipefail
ROOT="/Users/itisbryan/Desktop/personal/claude-missions/skills/mission/scripts"

# Pre-check: both scripts must parse
node --check "$ROOT/mission-state.mjs"  || { echo "SYNTAX ERROR mission-state.mjs"; exit 1; }
node --check "$ROOT/mission-checks.mjs" || { echo "SYNTAX ERROR mission-checks.mjs"; exit 1; }

# Run the guardrail harness (prints PASS/FAIL lines + METRIC lines)
node /Users/itisbryan/Desktop/personal/claude-missions/autoresearch_harness.mjs
