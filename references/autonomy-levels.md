# Autonomy Levels

## Low — Pause after every phase

- Complete one phase, then STOP and summarize what you did.
- Wait for the user to say "continue", "next", or "go" before proceeding to the next phase.
- If you encounter any ambiguity, ask immediately — do not assume.
- Present diffs or summaries of changes before moving on.

## Medium — Pause at phase boundaries and decision points

- Work through phases without pausing for routine decisions.
- STOP at phase boundaries to summarize progress and confirm direction.
- STOP if you encounter ambiguity that could affect the overall plan.
- STOP if a phase fails and you're unsure how to proceed.
- For routine decisions (naming, file structure), use your best judgment.

## High — Run to completion with minimal interruption

- Work through all phases without pausing.
- Only STOP if:
  - A critical failure occurs that you cannot recover from
  - An external dependency is missing (API key, service, etc.)
  - The spec is fundamentally ambiguous and proceeding would waste effort
- For all other decisions, use your best judgment and document your choices.
- At the end, provide a comprehensive summary of everything done.
