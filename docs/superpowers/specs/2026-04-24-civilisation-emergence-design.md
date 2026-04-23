# Emergent Civilisation — Design Spec

**Date:** 2026-04-24
**Project codename:** `emergent-civ`
**Target:** Open Agents hackathon (sponsors: 0G, Gensyn/AXL)
**Team:** 2 developers, ~160 human hours
**Tracks:** 0G (Storage + Compute) AND AXL (peer-to-peer agent communication) — both must be load-bearing.

---

## 1. Pitch

Autonomous LLM-backed agents live in a shared world. When they face a crisis they have no skill for, they reason via 0G Compute sealed inference, self-evaluate the proposed solution through a second sealed inference, write the verified skill to 0G Storage, and teach it to peers over AXL. When an agent dies, its skills persist on 0G Storage and are inherited by future agents.

The demo shows one full loop: crisis → reasoning → verified skill → peer teaching → death → inheritance → survival of a descendant against the same crisis using the inherited skill.

## 2. Goals / Non-goals

**Goals**
- One end-to-end emergence loop that is *cryptographically verifiable* (0G Compute receipts on every skill).
- Genuine peer-to-peer agent comms — agents are separate processes, AXL does real network work.
- Persistent, inheritable civilisation memory on 0G Storage.
- A 90-second live demo that lands without narration.

**Non-goals (explicit)**
- Economy, trade, currency, shelter, architecture, writing, maps, territory, factions, reproduction/genetics, multi-world, viewer betting, Twitch integration, mobile, auth, accounts, tilemap, sprites, pathfinding, combat animations. Out of scope. Do not build.

## 3. Demo script (target: 90 seconds)

1. 5 agents spawn, wander. *(0–10s)*
2. Lion appears near Agents A, B. *(10–15s)*
3. Agent A reasons via 0G Compute — first receipt flashes into the Receipts Gallery. Proposes "throw sharp rocks." *(15–30s)*
4. Self-eval sealed inference: score 0.7 → accepted. Second receipt appears. Skill written to 0G Storage. *(30–35s)*
5. AXL whisper A→B (animated edge). B learns the skill. *(35–40s)*
6. Lion flees. A and B survive. *(40–50s)*
7. Agent A dies (hunger, later). Skill persists on 0G Storage. *(50–60s)*
8. Agent D spawns fresh. On init, reads inherited skills from 0G Storage. Inheritance badge shows provenance chain. *(60–70s)*
9. Second lion appears. Agent D applies the inherited skill without reasoning. *(70–85s)*
10. Camera on Receipts Gallery — every skill's provenance is visible and verifiable. *(85–95s)*

This sequence is the acceptance test. If a headless run emits the event sequence below in order, the demo works:

`CRISIS_STARTED → REASONING_STARTED → SKILL_PROPOSED → SELF_EVAL_RESULT → SKILL_ACCEPTED → AXL_MESSAGE → SKILL_LEARNED → AGENT_DIED → AGENT_SPAWNED → SKILL_INHERITED → CRISIS_RESOLVED`

## 4. Tech stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript (Node 20+) across engine, agents, web | One language, shared types, 2 devs can swap tasks |
| Agent runtime | One Node process per agent on localhost | Makes AXL do real P2P work, not in-process cheat |
| Monorepo | pnpm workspaces + Turborepo | Hot reload across packages, fast hackathon iteration |
| LLM | 0G Compute (sealed) for hero decisions; cheap Anthropic/OpenAI call for background ticks | Cost control; verifiability only where narratively needed |
| Frontend | Vite + React + ReactFlow + Zustand | ReactFlow gives animated graph nodes/edges almost free |
| UI transport | WebSocket, single channel, engine → browser | Simplest real-time push |
| Local persistence | SQLite mirror of 0G Storage | Fast ticks + replay; 0G remains authoritative |

Rejected: Python backend (duplicate types), Rust/Go (scaffolding cost), agents-as-actors (AXL story collapses).

## 5. Architecture

```
                         ┌─────────────────────────┐
                         │   BROWSER (web pkg)     │
                         │   React + ReactFlow     │
                         │   - agents as nodes     │
                         │   - AXL msgs as edges   │
                         │   - event feed          │
                         │   - receipts gallery    │
                         └────────────▲────────────┘
                                      │ WebSocket (events)
                                      │
                  ┌───────────────────┴────────────────────┐
                  │           ENGINE (engine pkg)          │
                  │   - tick loop                          │
                  │   - world state                        │
                  │   - crisis orchestrator                │
                  │   - WS broadcaster                     │
                  │   - spawns N agent-runtime procs       │
                  └───────┬─────────┬─────────┬────────────┘
                          │ spawn   │ spawn   │ spawn
                     ┌────▼───┐ ┌───▼────┐ ┌──▼─────┐
                     │Agent 1 │ │Agent 2 │ │Agent N │   (agent-runtime pkg,
                     │ (proc) │ │ (proc) │ │ (proc) │    one process per agent)
                     └─┬──┬─┬─┘ └─┬──┬─┬─┘ └─┬──┬─┬─┘
                       │  │ │    │  │ │    │  │ │
              AXL ◀────┘  │ │    └──│─┤────┘  │ │    (peer-to-peer between agents)
              AXL ◀───────┼─┼───────┘ │       │ │
                          │ │         │       │ │
                   ┌──────▼─▼─────────▼───────▼─▼───────┐
                   │   adapter-0g-storage               │
                   │   adapter-0g-compute               │
                   └──────────────────┬─────────────────┘
                                      ▼
                         ┌────────────────────┐
                         │   0G NETWORK       │
                         └────────────────────┘

           Demo Controller (CLI) ──► Engine (trigger crisis, pause, replay)
```

## 6. Packages (services)

```
packages/
├── shared/              # Types: Agent, Skill, Event, Receipt. Immutable after hour 1.
├── engine/              # World tick loop, crisis orchestrator, WS server, process supervisor
├── agent-runtime/       # Per-agent program. N instances run concurrently.
├── adapter-0g-storage/  # putSkill, getSkill, appendEvent, listSkills
├── adapter-0g-compute/  # reason(), selfEvaluate(), returns Receipt
├── adapter-axl/         # broadcast, whisper, subscribe
├── web/                 # React visualiser
└── demo-controller/     # CLI to trigger crises, pause, replay
```

## 7. Core schemas

### Skill

```ts
type Skill = {
  id: string;                    // content hash
  name: string;                  // "sharpened_stick"
  description: string;
  preconditions: string[];       // required resources or parent skill ids
  effect: string;                // semantic description; LLM interprets vs. crisis
  steps: string[];
  provenance: {
    inventedBy: string;          // agent id
    inventedAt: number;          // tick
    bornFrom: string[];          // crisis id + parent skill ids (for composition)
    reasonReceipt: string;       // 0G Compute receipt hash
    selfEvalReceipt: string;     // 0G Compute receipt hash
    selfEvalScore: number;       // 0..1
  };
};
```

### Event types (single enum)

`WORLD_TICK · AGENT_SPAWNED · AGENT_DIED · CRISIS_STARTED · CRISIS_RESOLVED · REASONING_STARTED · SKILL_PROPOSED · SELF_EVAL_STARTED · SELF_EVAL_RESULT · SKILL_ACCEPTED · SKILL_REJECTED · AXL_MESSAGE · SKILL_TAUGHT · SKILL_LEARNED · SKILL_INHERITED`

Every event carries `{ tick, actorId, payload, receiptHash? }` and is written to the 0G Storage event log *and* pushed over WebSocket.

## 8. Core mechanics

### Crisis
A world-state condition with a deadline, injected by the engine at a chosen tick. Affected agents must resolve before the deadline or take damage / die. On each tick under crisis, an affected agent:

1. Scans known skills. If any skill's `effect` plausibly addresses the crisis (LLM interpretation against inventory), apply it.
2. Otherwise, invoke the reasoning loop (below).

### Reasoning loop (hero mechanic)

**Inference 1** — 0G Compute, sealed:
> *"Crisis: X. Resources: Y. Known skills: Z. Propose a solution as a new Skill (name, steps, effect)."*
> → candidate Skill

**Inference 2** — 0G Compute, sealed, independent prompt:
> *"Given world physics {rocks fly, sticks break, lions fear pointy things, ...}, evaluate this proposed solution: {candidate}. Score 0–1, list failure modes."*
> → `{ score, failureModes[] }`

Accept if `score ≥ 0.6`. Both receipts attached to the Skill. Rejected proposals emit `SKILL_REJECTED` with the receipt; the agent may retry with different framing.

### Teaching (AXL)
Skill owner sends `TEACH(skillId)` over AXL to a nearby peer. Peer fetches the Skill body from 0G Storage by id (AXL carries the pointer + a short abstract, not the full payload). Peer records provenance entry in its own state. Emits `SKILL_LEARNED`.

### Inheritance
New agent on spawn reads all skills from 0G Storage tagged as "ancestry-accessible" (v1: all skills). Emits `SKILL_INHERITED` for each.

## 9. Error handling

| Failure | Behaviour |
|---|---|
| 0G Compute timeout/error | Fall back to direct Anthropic/OpenAI inference. Skill marked `unverified` with a visible badge. Demo must not hit this; judge-facing honesty if it does. |
| 0G Storage write fail | 3 retries with exponential backoff. On final fail, queue locally, warn in event feed, engine keeps ticking. |
| AXL partition | Agent works solo. On reconnect, pending teach messages flush. Visualiser shows disconnected-peer state. |
| Agent process crash | Engine detects process exit. Respawns from last-tick snapshot in SQLite mirror. Event feed marks respawn. |

## 10. Testing

Hackathon-scoped. Not comprehensive.

- **Unit tests** on the three adapters only, using mocked 0G and AXL. Adapters are the silent-bug zone.
- **Deterministic replay**: every LLM / 0G response during a canonical run is recorded to a fixture file. Tests and demo-fallback mode replay the fixture. Also mitigates live-demo LLM non-determinism risk.
- **Smoke test**: headless run of the demo scenario. Assert the event sequence in §3 appears in order. If it passes, the demo works.

No broader coverage.

## 11. Division of labour

**Dev A — systems (~80h)**
- Day 1 spikes (AXL, 0G Compute, 0G Storage — 6h)
- `shared/` schema (co-owned with Dev B, locked hour 1)
- `engine/` — tick loop, process supervisor, WS server, crisis orchestrator
- `agent-runtime/` — decision loop, reasoning loop, teach/learn handlers
- Three adapters

**Dev B — experience (~80h)**
- `web/` — ReactFlow graph, event feed, Receipts Gallery, inheritance badges
- `demo-controller/` — CLI or keybind panel to trigger crises, pause, replay
- Demo script, canonical replay fixture, recording
- Smoke-test scenario

**Shared contract**: `packages/shared/` locked day 1 hour 1. Both devs import. Any change requires a 2-minute sync.

## 12. Hour budget

| Block | Hours |
|---|---|
| Day-1 spikes (AXL, 0G Compute, 0G Storage round-trips) | 6 |
| Shared schema + repo scaffold | 4 |
| Engine (tick, crisis, supervisor, WS) | 16 |
| Agent runtime (decision + reasoning loops) | 18 |
| 0G Storage adapter | 8 |
| 0G Compute adapter (sealed inference + receipts) | 12 |
| AXL adapter (teach/learn protocol) | 14 |
| Web visualiser (ReactFlow, event feed, receipts gallery) | 22 |
| Demo controller + crisis scripting | 10 |
| Deterministic replay + smoke test | 10 |
| Demo polish, recording, debugging | 20 |
| Buffer | 20 |
| **Total** | **160** |

## 13. Risks and day-1 de-risking

- **AXL SDK surface unknown**: could be Rust-first or require a sidecar. Hour-1 spike: round-trip a message between two local processes. If blocked at hour 2, switch adapter to a sidecar pattern (AXL CLI over local socket).
- **0G Compute Node SDK**: confirm `reason()` round-trip and receipt structure in hour 1. Same sidecar fallback if blocked.
- **LLM cost**: every tick × every agent × LLM call = budget bonfire. Reserve 0G Compute for "significant" decisions, cache routine decisions, use a cheap model for background.
- **Live-demo non-determinism**: deterministic replay mode is the mitigation. Record one canonical run, rehearse demo against it, have a button to switch live/replay.
- **Visualiser scope creep**: time-boxed at 22h. If exceeded, cut receipts gallery animation first.

## 14. Tier 2 (build only if core ships by hour 100)

- Second crisis type (hunger or weather) — proves system generalises.
- Skill composition: agents combine two known skills to propose a new one.
- Lossy/partial teaching over AXL — learner needs reinforcement, makes AXL load-bearing.
- Reputation weighting between agents.
- Receipts Gallery with filter + chain view.

## 15. Open questions (resolved)

- Track: both 0G and AXL. Both adapters must be load-bearing.
- Agent isolation: separate processes.
- Frontend: ReactFlow.
- Steady-state agents: 5.
- Single tribe.
- Demo: live with pre-recorded fallback via deterministic replay.

## 16. Out of scope

See §2 non-goals. If any Tier-3 feature feels load-bearing later, re-open this spec rather than building it silently.
