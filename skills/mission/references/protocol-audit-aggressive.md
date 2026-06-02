# Aggressive Token Optimizations — Opt-In, Off by Default

These trade audit thoroughness for tokens. **All are disabled unless explicitly turned on** in `.missions/active-mission.json` under `optimizations`. With the key absent, the Audit phase behaves exactly as `protocol-audit.md` describes (full panel, all reviewers on their assigned models).

```json
"optimizations": {
  "gateSecurityReviewer": false,
  "microMissionMode": false
}
```

Enable per-mission only when you (and the user) accept the stated risk. Each gate is biased to **dispatch when uncertain** — the failure mode should be "ran a reviewer we didn't need", never "skipped one that mattered".

---

## 1. Gate the Security reviewer (`gateSecurityReviewer: true`)

By default Reviewer 2 (Security) always runs. With this flag on, dispatch it **only when** the Step 0.5 prefilter's `gating.security` is `true`. That flag is set when the changed files match any of: `hasAuth`, `hasCrypto`, `hasInput`, `hasIO`, `hasHttpEndpoints`, `hasSecrets`, **or** any `P0` prefilter finding exists, **or** scope detection was inconclusive (no files scanned).

- **Saves** the full Security-reviewer budget (~12–15K) on changes with no auth/input/crypto/IO surface (UI-only, data-model-only, pure utilities).
- **Risk (medium-high):** a false negative skips security review on something that actually touches a sensitive surface — the worst miss in the skill. The detectors are conservative, but **keep this OFF for any repo handling user data, auth, payments, or PII** until you've benchmarked the detectors on that codebase.

## 2. Micro-mission mode (`microMissionMode: true`)

Uses the prefilter's `size` (`filesChanged`, `linesChanged`):

- **Tiny diff** (`linesChanged < 50` AND `filesChanged < 3`): merge Reviewer 4 (Async) + Reviewer 5 (Performance) into **one** advisory "Architecture" reviewer that covers both lenses in a single pass. **Score it as role `reviewer_architecture` (class Warden 🏯), NOT `reviewer`** — so the merged pass doesn't skew the Druid (`reviewer`) career average.
- **Single-file change** (`filesChanged == 1` AND `linesChanged < 20`): offer the user a choice — *Reviewer-1 (Business Logic) only* (fastest, riskiest) vs *full audit*. Do not pick silently.
- **Always fall back to the full 5-reviewer audit** when above these thresholds, when `size.linesChanged` is `null` (unknown), or when any changed file touches a shared/public interface (exports, API surface, schema, auth).

- **Saves** ~6–8K (tiny diffs) / ~4–6K (single-file).
- **Risk (high):** merging Async + Perf sacrifices two independent expert lenses; concurrency/perf antipatterns can hide even in small diffs. Emergency single-reviewer mode is riskier still.

## 3. Haiku for pattern-heavy reviewer lenses (no flag — model override + benchmark)

This one needs no `optimizations` flag; it's a `modelAssignment` override. You **may** set:

```json
"modelAssignment": { "business_reviewer": "claude-haiku-4-5-20251001", "edge_case_reviewer": "claude-haiku-4-5-20251001" }
```

- **Only** Business Logic and Edge Cases — these are the most checklist-driven lenses and tolerate Haiku when given explicit boundary/heuristic checklists in their prompts.
- **Do NOT** downgrade `security_reviewer` or the async/perf `reviewer` role: they need semantic code-flow reasoning, and `reviewer` is shared by two lenses, so downgrading would systematically depress Druid-class scores.
- **Benchmark first:** confirm ≥95% P0/P1 detection parity vs Sonnet on a representative diff before relying on it. Saves ~4–6K per downgraded lens.

## 4. JSON audit synthesis (`jsonSynthesis: true`)

Replace the LLM's manual merge/dedup of audit findings (protocol-audit.md Step 2) with a deterministic script:
1. Append to each reviewer prompt: *"Output findings as a JSON array, one object per finding: `{rule, severity (P0–P3), file, line, snippet, issue, fix, reviewer}`."*
2. Step 1.5: write each reviewer's JSON array to `.missions/reviewer-findings-<role>.json`.
3. New Step 1.6: run `node ~/.claude/skills/mission/scripts/mission-checks.mjs audit-synthesis --json --findings .missions/reviewer-findings-business_logic.json,.missions/reviewer-findings-security.json,…` — it merges by file+line (highest severity wins), dedups, records which reviewers flagged each, and sorts P0→P3. Use its output as the synthesized finding list instead of merging by hand.

- **Saves** the manual synthesis pass (~5–8K/audit) and makes merging deterministic/repeatable.
- **Risk (medium):** forces reviewers into structured JSON (constrains prose) and assumes the host tool supports JSON subagent output. Touches all reviewer prompts — roll out together.

---

## Recording the choice

When any optimization is enabled, note it in the Audit Report so the verdict is interpreted in context (e.g. "Security reviewer skipped — scope gating, no auth/input/IO/crypto surface detected"). Skipped or merged reviewers simply produce fewer score entries; the scoring streak only resets if the Audit *phase* logs **zero** scores, so a trimmed panel is gamification-safe.
