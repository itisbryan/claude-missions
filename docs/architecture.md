# Architecture

## Mission Lifecycle

```mermaid
flowchart TD
    Start["/mission description"] --> Setup

    subgraph Setup["Setup"]
        Q1[Template?] --> Q2[Mode?]
        Q2 --> Q3[Autonomy?]
        Q3 --> Q4[Constraints?]
        Q4 --> Q5[Model Assignment?]
        Q5 --> Q6[Checks?]
        Q6 --> ReadClaude[Read CLAUDE.md]
        ReadClaude --> Worktree[Create git worktree]
        Worktree --> State[Write state file]
    end

    State --> Phase1

    subgraph Phases["Phase Execution Loop"]
        Phase1["📐 Architect"] --> Phase2["👁️ Review Plan"]
        Phase2 -->|approved| Phase3["🔨 Implement"]
        Phase3 --> Phase4["🧪 Test"]
        Phase4 --> Phase5["🔍 Audit"]
        Phase5 --> Phase6["✅ Verify"]
    end

    Phase2 -->|changes requested| Phase1
    Phase6 --> Done["🎉 Mission Complete"]

    Pause["⏸ /mission pause"] -.-> Phases
    Skip["/mission skip"] -.-> Phases
    Handoff["/mission handoff"] -.-> HandoffDoc["Write handoff.md"]
    HandoffDoc -.-> NewSession["/mission in new session"]
    NewSession -.-> Phases
```

## Parallel Subagents

```mermaid
flowchart LR
    subgraph Architect["📐 Architect Phase"]
        direction TB
        O1[Orchestrator] --> E1["🔍 Agent 1\nStructure\n(haiku)"]
        O1 --> E2["🔍 Agent 2\nDomain\n(haiku)"]
        O1 --> E3["🔍 Agent 3\nTesting\n(haiku)"]
        E1 --> Synth1[Synthesize]
        E2 --> Synth1
        E3 --> Synth1
        Synth1 --> Spec["📋 Write Spec\n(opus)"]
    end

    subgraph Implement["🔨 Implement Phase"]
        direction TB
        O2[Orchestrator] --> W1["⚙️ Worker 1\n(sonnet)"]
        O2 --> W2["⚙️ Worker 2\n(sonnet)"]
        O2 --> W3["⚙️ Worker N\n(sonnet)"]
        W1 --> Merge[Merge results]
        W2 --> Merge
        W3 --> Merge
    end

    subgraph Audit["🔍 Audit Phase"]
        direction TB
        O3[Orchestrator] --> R1["📋 Business\n(sonnet)"]
        O3 --> R2["🔒 Security\n(sonnet)"]
        O3 --> R3["🧪 Edge Cases\n(sonnet)"]
        O3 --> R4["⚡ Async\n(sonnet)"]
        O3 --> R5["📊 Perf\n(sonnet)"]
        R1 --> Synth2[Synthesize]
        R2 --> Synth2
        R3 --> Synth2
        R4 --> Synth2
        R5 --> Synth2
    end
```

## Failure Escalation & Auto-Handoff

```mermaid
flowchart TD
    Dispatch["Orchestrator dispatches\nsubagent for work item"] --> Result{Success?}

    Result -->|yes| Next["✅ Next work item"]
    Result -->|no| Log["Log attempt\nto failureLog"]

    Log --> TotalCheck{"Total attempts\n≥ 6?"}
    TotalCheck -->|yes| HardStop["🛑 HARD STOP\nAsk user:\nskip / fix / abort"]

    TotalCheck -->|no| SessionCheck{"Attempts this\nsession < 3?"}
    SessionCheck -->|yes| Retry["Spawn new subagent\n(different approach,\nknows what failed)"]
    Retry --> Result

    SessionCheck -->|no| Opus["🧠 Escalate to Opus\ndebug agent"]
    Opus --> OpusResult{Opus\nsucceeds?}

    OpusResult -->|yes| Resolved["✅ Resolved"]
    OpusResult -->|no| AutoHandoff["📄 Auto-generate\nhandoff.md"]
    AutoHandoff --> PauseMission["⏸ Pause mission"]
    PauseMission --> Inform["Inform user"]

    Inform --> NewSession["/mission\nin new session"]
    NewSession --> ReadHandoff["Read handoff.md\n+ failureLog"]
    ReadHandoff --> Dispatch

    style HardStop fill:#ff6b6b,color:#fff
    style Resolved fill:#51cf66,color:#fff
    style Next fill:#51cf66,color:#fff
    style Opus fill:#845ef7,color:#fff
```

## State & Session Continuity

```mermaid
flowchart LR
    subgraph Session1["Session 1"]
        M1["/mission desc"] --> Execute1[Execute phases]
        Execute1 --> Fail1[Failure exhausted]
        Fail1 --> Write1["Write handoff.md\n+ state.json"]
    end

    Write1 --> Disk[("📁 .missions/\n├ active-mission.json\n└ handoff.md")]

    Disk --> Resume

    subgraph Session2["Session 2"]
        Resume["/mission"] --> ReadState["Read state +\nhandoff.md"]
        ReadState --> Continue["Resume from\ncurrent phase"]
        Continue --> Done2["✅ Complete"]
    end
```

## Chain of Command

```
User
  └─→ /mission orchestrator (the brain)
        ├─→ Scripts (deterministic — no reasoning)
        │     ├── mission-state.mjs
        │     ├── mission-checks.mjs
        │     └── worktree-manager.mjs
        ├─→ Subagents (reasoning — no decisions)
        │     ├── Explorer agents (haiku)
        │     ├── Worker agents (sonnet)
        │     ├── Reviewer agents (sonnet)
        │     └── Debug agent (planner model)
        └─→ State file (single source of truth)
```

Commands flow downward only. Subagents report results — they never decide to retry, escalate, or hand off. Only the orchestrator writes to the state file.
