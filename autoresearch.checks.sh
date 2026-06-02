#!/bin/bash
set -euo pipefail
ROOT="/Users/itisbryan/Desktop/personal/claude-missions/skills/mission/scripts"

# Scripts parse
node --check "$ROOT/mission-state.mjs"
node --check "$ROOT/mission-checks.mjs"

# No regression in core scoring math: composite 3.9 -> solid, 49 XP
OUT=$(node "$ROOT/mission-state.mjs" score-compute '{"agent":"x","scores":{"quality":4,"completeness":3,"efficiency":5}}')
echo "$OUT" | grep -q '"composite": 3.9' || { echo "REGRESSION: composite math changed"; exit 1; }
echo "$OUT" | grep -q '"verdict": "solid"' || { echo "REGRESSION: verdict bands changed"; exit 1; }
echo "$OUT" | grep -q '"xp": 49' || { echo "REGRESSION: XP formula changed"; exit 1; }

# Valid audit-prefilter still emits gating in a real repo
node "$ROOT/mission-checks.mjs" audit-prefilter --json --files "$ROOT/mission-state.mjs" >/dev/null || { echo "REGRESSION: audit-prefilter broke"; exit 1; }

echo "CHECKS OK"
