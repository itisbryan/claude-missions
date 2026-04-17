# Persona Map — RPG Classes for Mission Roles

Canonical mapping of orchestrator roles to RPG classes. Single source of truth referenced by protocols and `mission-state.mjs`.

Personas are **display-layer only** — they do not alter XP math, composite scoring, or verdict bands.

## Class Roster

| Role | Class | Emoji | Flavor |
|---|---|---|---|
| `explorer` | Scout | 🔭 | scouts the terrain, reports what's out there |
| `planner` | Mage | 🧙 | channels insight into a spec |
| `worker` | Knight | ⚔️ | wields code as blade, ships commits |
| `security_reviewer` | Rogue | 🗡️ | thinks like the adversary, finds the blind spot |
| `business_reviewer` | Cleric | 📜 | keeps faith with the spec, calls out drift |
| `edge_case_reviewer` | Ranger | 🎯 | tracks what happy-path misses |
| `reviewer` | Druid | 🌿 | reads system nature — time, flow, growth |
| `verifier` | Paladin | 🛡️ | seals the work, bears the final oath |

Unknown roles fall back to the role name with a ❓ emoji.

## Usage in Protocols

When dispatching a subagent, the orchestrator may address it by class in the feed-forward prefix:

```
Scout, your last sweep scored 3.9/5. Key gap: missed the middleware chain.
Maintain your scouting pace, but this run track the request lifecycle explicitly.
```

Class names also appear in:
- Phase-transition gamification readout (party composition line)
- Mission scorecard (party roster, MVP, needs-training)
- `mission-state.mjs profile` career scoreboard

## Implementation

The `PERSONAS` constant in `mission-state.mjs` is the authoritative definition. This document mirrors it for human reference.
