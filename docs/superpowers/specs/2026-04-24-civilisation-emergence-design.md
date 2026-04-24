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
- **Clean three-part architecture**: Kernel (substrate) · Personality (per-agent config) · Environment (world config) — so judges and future contributors can reason about the system at a glance.

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

**Acceptance test** (the demo works if this event sequence appears in order during a headless run):

`CRISIS_STARTED → REASONING_STARTED → SKILL_PROPOSED → SELF_EVAL_RESULT → SKILL_ACCEPTED → AXL_MESSAGE → SKILL_LEARNED → AGENT_DIED → AGENT_SPAWNED → SKILL_INHERITED → CRISIS_RESOLVED`

## 4. Three-part architecture

The system is shaped around three concepts. Every file, every change, should belong cleanly to one of them (or to the orchestration glue around them).

| Concept | Purpose | Shape | Pluggable |
|---|---|---|---|
| **Kernel** | The substrate. Unified API for *compute* (0G Compute: reason + self-eval), *sharing* (AXL peer comms), and *persistence* (0G Storage). Owns the self-evolution loop (`evolve()`). | Library, linked into every agent process. Adapters live inside the kernel behind interfaces. | Not swapped at runtime; adapters inside are DI'd and mockable. |
| **Personality** | Declarative per-agent identity: name, traits, risk tolerance, innate skills, prompt fragments. Hot-swappable. | JSON/TS config file per agent. | Yes — swap to run experiments with different agent personas. |
| **Environment** | Declarative world config: physics rules, starting resources, topology, crisis schedule, success/failure conditions. | JSON/TS config file per world. | Yes — swap "savannah with lions" for "tundra with storms" without touching code. |

The **engine** is orchestration glue — it loads an environment, spawns agents with personalities, runs ticks, injects crises, supervises processes. It is not one of the three "concepts"; it is the runtime that composes them.

### Kernel, in more detail

The kernel exposes two layers of API. Agents call whichever fits the operation:

1. **Substrate layer** (low-level, transport-ish):
   - `kernel.compute.infer(prompt, opts)` — runs a sealed inference, returns `{result, receipt}`.
   - `kernel.storage.putSkill/getSkill/listSkills/appendEvent` — persistence.
   - `kernel.net.whisper(peerId, msg) / broadcast(msg) / subscribe(handler)` — peer comms.
2. **Self-evolution layer** (high-level, domain-specific):
   - `kernel.evolve(crisis, context)` — orchestrates the full reason → self-eval → accept/reject → persist → broadcast loop. This is the hero call.

Adapters (`0g-compute`, `0g-storage`, `axl`) live inside `kernel/adapters/` behind interfaces (`IComputeAdapter`, `IStorageAdapter`, `INetworkAdapter`). Concrete implementations are DI'd at kernel boot. Swapping 0G Compute for a mock in tests is one constructor argument.

### Pluggability philosophy

Pluggability comes from interface shape, not module layout. A fat kernel where the adapters live inside is just as pluggable as a thin kernel with separate adapter packages, provided the kernel depends on interfaces. We chose fat kernel because it (a) gives agents a single dep, (b) consolidates retries/fallback/error policy, and (c) produces a crisp narrative: *"the kernel is the self-evolution substrate."*

## 5. Tech stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript (Node 20+) across engine, agents, kernel, web | One language, shared types, 2 devs can swap tasks |
| Agent runtime | One Node process per agent on localhost | Makes AXL do real P2P work, not in-process cheat |
| Monorepo | pnpm workspaces + Turborepo | Hot reload across packages, fast hackathon iteration |
| LLM | 0G Compute (sealed) for hero decisions; cheap Anthropic/OpenAI call for background ticks | Cost control; verifiability only where narratively needed |
| Frontend | Vite + React + ReactFlow + Zustand | ReactFlow gives animated graph nodes/edges almost free |
| UI transport | WebSocket, single channel, engine → browser | Simplest real-time push |
| Local persistence | SQLite mirror of 0G Storage | Fast ticks + replay; 0G remains authoritative |

Rejected: Python backend (duplicate types), Rust/Go (scaffolding cost), agents-as-actors (AXL story collapses), thin-kernel-with-separate-adapter-packages (extra indirection with no benefit at this scale).

## 6. Architecture

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
                  │   - loads environment/*.json           │
                  │   - loads personality/*.json           │
                  │   - tick loop                          │
                  │   - crisis orchestrator                │
                  │   - process supervisor                 │
                  │   - WS broadcaster                     │
                  │   - physics adjudication               │
                  └───────┬─────────┬─────────┬────────────┘
                          │ spawn   │ spawn   │ spawn
                     ┌────▼───┐ ┌───▼────┐ ┌──▼─────┐
                     │Agent 1 │ │Agent 2 │ │Agent N │
                     │(runtime│ │(runtime│ │(runtime│
                     │+kernel)│ │+kernel)│ │+kernel)│
                     └─┬──┬─┬─┘ └─┬──┬─┬─┘ └─┬──┬─┬─┘
                       │  │ │    │  │ │    │  │ │
              AXL ◀────┘  │ │    └──│─┤────┘  │ │   (AXL peer-to-peer,
              AXL ◀───────┼─┼───────┘ │       │ │    inside each kernel)
                          │ │         │       │ │
                   ┌──────▼─▼─────────▼───────▼─▼───────┐
                   │   kernel/adapters/0g-compute       │
                   │   kernel/adapters/0g-storage       │
                   └──────────────────┬─────────────────┘
                                      ▼
                         ┌────────────────────┐
                         │   0G NETWORK       │
                         └────────────────────┘

           Demo Controller (CLI) ──► Engine (trigger crisis, pause, replay)
```

## 7. Packages

```
packages/
├── shared/              # Types: Agent, Skill, Event, Receipt, Crisis, Personality,
│                        # Environment. Immutable after hour 1.
│
├── kernel/              # The substrate. Used by every agent-runtime process.
│   ├── adapters/
│   │   ├── 0g-compute.ts   # IComputeAdapter impl → 0G Compute sealed inference
│   │   ├── 0g-storage.ts   # IStorageAdapter impl → 0G Storage
│   │   └── axl.ts          # INetworkAdapter impl → AXL peer comms
│   ├── substrate.ts     # Public substrate API: compute / storage / net
│   ├── evolve.ts        # Self-evolution loop: reason → self-eval → persist → broadcast
│   └── index.ts         # Kernel factory; DI of adapters at boot
│
├── personality/         # Declarative agent configs + loader
│   ├── schema.ts        # Personality type (re-exports from shared)
│   ├── personalities/   # alice.json, bob.json, ...
│   └── load.ts
│
├── environment/         # Declarative world configs + loader + physics adjudication
│   ├── schema.ts        # Environment type (re-exports from shared)
│   ├── worlds/          # savannah.json, tundra.json, ...
│   ├── load.ts
│   └── physics.ts       # Resolves "does this skill apply to this crisis?" given physics
│
├── engine/              # Orchestrator: tick loop, crisis injection, process supervisor,
│                        # WebSocket broadcaster, physics calls
│
├── agent-runtime/       # Per-agent program. Loads a personality, instantiates a kernel,
│                        # runs the decision loop, delegates all IO to the kernel.
│
├── web/                 # React visualiser (ReactFlow, event feed, receipts gallery)
│
└── demo-controller/     # CLI to trigger crises, pause, toggle live/replay
```

## 8. Core schemas

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

### Personality

```ts
type Personality = {
  id: string;                    // "alice"
  name: string;
  traits: string[];              // free-form, fed into prompts
  risk: number;                  // 0..1, affects self-eval acceptance threshold
  innateSkills: string[];        // skill ids agent starts with
  promptFragments: {
    reasoning?: string;          // personality-flavoured reasoning prompt addition
    selfEval?: string;
  };
};
```

### Environment

```ts
type Environment = {
  id: string;                    // "savannah"
  physics: string[];             // ["rocks fly", "lions fear pointy things", ...]
  resources: string[];           // ["rocks", "sticks", "berries", ...]
  topology: "open" | "ring" | "hub"; // affects AXL peer discovery
  crisisSchedule: Array<{
    tick: number;
    type: string;                // "LION", "HUNGER", "STORM"
    targets?: string[];          // agent ids if scoped
    deadlineTicks: number;
  }>;
};
```

### Event types (single enum)

`WORLD_TICK · AGENT_SPAWNED · AGENT_DIED · CRISIS_STARTED · CRISIS_RESOLVED · REASONING_STARTED · SKILL_PROPOSED · SELF_EVAL_STARTED · SELF_EVAL_RESULT · SKILL_ACCEPTED · SKILL_REJECTED · AXL_MESSAGE · SKILL_TAUGHT · SKILL_LEARNED · SKILL_INHERITED`

Every event carries `{ tick, actorId, payload, receiptHash? }` and is written to the 0G Storage event log *and* pushed over WebSocket.

## 9. Core mechanics

### Crisis
A world-state condition with a deadline, injected by the engine at a scheduled tick (from `environment.crisisSchedule`). Affected agents must resolve before the deadline or take damage / die. On each tick under crisis, an affected agent:

1. Scans known skills. If any skill's `effect` plausibly addresses the crisis (`environment/physics.ts` adjudicates), apply it.
2. Otherwise, invoke `kernel.evolve(crisis, context)`.

### Self-evolution loop — `kernel/evolve.ts` (hero mechanic)

**Inference 1** — `substrate.compute.infer(reasonPrompt)` → 0G Compute, sealed.
> Prompt is built from: `personality.promptFragments.reasoning` + `environment.physics` + crisis + inventory + knownSkills.
> → candidate Skill + receipt.

**Inference 2** — `substrate.compute.infer(evalPrompt)` → 0G Compute, sealed, independent.
> Prompt is built from: `environment.physics` + candidate Skill.
> → `{ score, failureModes[] }` + receipt.

Accept threshold = `0.6` baseline, adjusted by `personality.risk` (reckless agents accept lower scores). On accept: `substrate.storage.putSkill(skill)` → emit `SKILL_ACCEPTED`. On reject: emit `SKILL_REJECTED` with receipt.

### Teaching (AXL)
Skill owner: `kernel.net.whisper(peerId, {kind:"TEACH", skillId})`. Receiver: kernel's AXL subscriber fires → `kernel.substrate.storage.getSkill(id)` → adds to local skill set → emits `SKILL_LEARNED`. AXL carries the skill id + short abstract; full skill body pulled from 0G Storage by the receiver.

### Inheritance
New agent on spawn runs `kernel.storage.listSkills()` → any skills not in `personality.innateSkills` are inherited. Emits `SKILL_INHERITED` per skill.

## 10. Example end-to-end flow (lion scenario)

Traces every cross-package call so reviewers can map narrative to code.

**Boot**
- `engine/` loads `environment/worlds/savannah.json` + five `personality/personalities/*.json` + opens WS for `web/`.
- `engine/` spawns 5 `agent-runtime` processes with `{agentId, personalityPath, envSummary, peerAddrs, endpoints}`.
- Each `agent-runtime` instantiates `kernel` (adapters DI'd), `kernel.net` connects to peers over AXL, `kernel.storage.listSkills()` hydrates inherited skills.

**Tick 40: lion appears near A, B**
- `engine/` emits `CRISIS_STARTED` on WS → `web/` renders lion overlay.
- `engine/` sends tick to each agent via stdio.
- `agent-runtime(A)`: no matching skill → `kernel.evolve({crisis, inventory, knownSkills, environment})`.

**Inside `kernel/evolve.ts` (Agent A's process)**
```
reasonPrompt ← build(personality.promptFragments, environment.physics, crisis, inventory)
substrate.compute.infer(reasonPrompt) → adapters/0g-compute.ts → 0G Compute
  ⇒ { candidateSkill, receipt: 0xabc... }

evalPrompt ← buildEval(environment.physics, candidateSkill)
substrate.compute.infer(evalPrompt) → adapters/0g-compute.ts → 0G Compute
  ⇒ { score: 0.72, failures, receipt: 0xdef... }

score ≥ threshold  → build Skill, attach both receipts
substrate.storage.putSkill(skill) → adapters/0g-storage.ts → 0G Storage
emit SKILL_ACCEPTED → engine (stdio) → web (WS)
```

**Teaching**
- `agent-runtime(A)` → `kernel.net.whisper("B", {kind:"TEACH", skillId})` → `kernel/adapters/axl.ts` → AXL peer→peer → Agent B's process.
- Engine sees `AXL_MESSAGE` and forwards to `web/`, which animates edge A→B.
- `agent-runtime(B)`: AXL subscriber fires → `kernel.substrate.storage.getSkill(id)` → adds skill → emits `SKILL_LEARNED`.

**Resolution**
- Both A and B apply `throw_rocks`. `engine/` asks `environment/physics.ts` whether it resolves the lion crisis given current state → yes → emits `CRISIS_RESOLVED`. `web/` clears lion overlay.

**Death and inheritance (later)**
- Agent A dies of hunger → `AGENT_DIED`. Skill persists on 0G Storage.
- `engine/` spawns fresh Agent D. On boot, `kernel.storage.listSkills()` surfaces `throw_rocks`. Personality has no innate match → `SKILL_INHERITED`.
- Second lion appears → D matches `throw_rocks` immediately. No 0G Compute call. Survives.

## 11. Who owns what

| Folder | Owns | Does NOT own |
|---|---|---|
| `shared/` | All cross-package types | Behaviour |
| `environment/` | World configs (physics, resources, crisis schedule) + physics adjudication | Runtime state, agent state |
| `personality/` | Agent configs (traits, innate skills, prompt fragments) | Skill execution logic |
| `kernel/` | Adapters (DI'd, interface-backed), substrate API, `evolve()` self-evolution loop | World state, tick loop, orchestration |
| `agent-runtime/` | Decision loop, local skill set, applying skills | 0G / AXL transport (delegates to kernel) |
| `engine/` | Tick loop, crisis orchestrator, process supervisor, WS broadcaster, physics calls | Anything inside an agent's head; any sponsor SDK call |
| `web/` | ReactFlow graph, event feed, receipts gallery, inheritance badges | Any game logic |
| `demo-controller/` | CLI to trigger crises, pause, toggle live/replay | Anything else |

## 12. Error handling

| Failure | Behaviour | Owner |
|---|---|---|
| 0G Compute timeout/error | Fall back to direct Anthropic/OpenAI inference. Skill marked `unverified` with a visible badge. | `kernel/adapters/0g-compute` |
| 0G Storage write fail | 3 retries with exponential backoff. On final fail, queue locally, warn in event feed, engine keeps ticking. | `kernel/adapters/0g-storage` |
| AXL partition | Agent works solo. On reconnect, pending teach messages flush. Visualiser shows disconnected-peer state. | `kernel/adapters/axl` |
| Agent process crash | Engine detects process exit. Respawns from last-tick snapshot in SQLite mirror. Event feed marks respawn. | `engine/` |

## 13. Testing

Hackathon-scoped. Not comprehensive.

- **Unit tests** on the three adapters only, using the interface mocks. Adapters are the silent-bug zone.
- **Deterministic replay**: every LLM / 0G response during a canonical run is recorded to a fixture file. Tests and demo-fallback mode replay the fixture. Also mitigates live-demo LLM non-determinism risk. The replay adapter is a drop-in `IComputeAdapter` implementation — no other code changes.
- **Smoke test**: headless run of the demo scenario. Assert the event sequence in §3 appears in order. If it passes, the demo works.

No broader coverage.

## 14. Division of labour

**Dev A — systems (~80h)**
- Day 1 spikes: round-trip AXL, 0G Compute, 0G Storage (6h)
- `shared/` schema (co-owned with Dev B, locked hour 1)
- `kernel/` — adapters, substrate, `evolve()`
- `agent-runtime/` — decision loop, teach/learn handlers
- `engine/` — tick loop, crisis orchestrator, process supervisor

**Dev B — experience (~80h)**
- `web/` — ReactFlow graph, event feed, Receipts Gallery, inheritance badges
- `personality/` + `environment/` schemas and seed configs (savannah + 5 personalities)
- `demo-controller/`
- Demo script, canonical replay fixture, recording
- Smoke-test scenario

**Shared contract**: `packages/shared/` locked day 1 hour 1. Both devs import. Any change requires a 2-minute sync.

## 15. Hour budget

| Block | Hours |
|---|---|
| Day-1 spikes (AXL, 0G Compute, 0G Storage round-trips) | 6 |
| Shared schema + repo scaffold | 4 |
| Personality + Environment schemas + seed configs | 4 |
| Kernel adapters (three, behind interfaces) | 18 |
| Kernel substrate + `evolve()` loop | 14 |
| Engine (tick, crisis, supervisor, WS) | 14 |
| Agent runtime (decision loop, teach/learn) | 12 |
| Web visualiser (ReactFlow, event feed, receipts gallery) | 22 |
| Demo controller + crisis scripting | 10 |
| Deterministic replay + smoke test | 10 |
| Demo polish, recording, debugging | 20 |
| Buffer | 26 |
| **Total** | **160** |

## 16. Risks and day-1 de-risking

- **AXL SDK surface unknown**: could be Rust-first or require a sidecar. Hour-1 spike: round-trip a message between two local processes. If blocked at hour 2, the `INetworkAdapter` interface lets us swap in a sidecar-over-local-socket implementation without touching the kernel or agents.
- **0G Compute Node SDK**: confirm `compute.infer()` round-trip and receipt structure in hour 1. Same sidecar fallback if blocked — `IComputeAdapter` is the seam.
- **LLM cost**: every tick × every agent × LLM call = budget bonfire. Reserve `kernel.compute.infer` (0G) for "significant" decisions; use a cheap model via a `LightLLMAdapter` for routine ticks.
- **Live-demo non-determinism**: replay adapter is the mitigation. One canonical run → fixture → `IComputeAdapter` swapped for replay impl during demo fallback.
- **Visualiser scope creep**: time-boxed at 22h. If exceeded, cut receipts gallery animation first.

## 17. Tier 2 (build only if core ships by hour 100)

- Second crisis type (hunger or storm) — just a new `environment.crisisSchedule` entry + physics rule. Should be near-free given the architecture.
- Second personality variant set (reckless vs cautious) to show personality affecting evolve threshold.
- Skill composition: `evolve()` accepts two parent skill ids and proposes a combined new skill.
- Lossy/partial teaching over AXL — learner needs reinforcement from multiple teachers.
- Receipts Gallery with filter + chain view.

## 18. Open questions (resolved)

- Track: both 0G and AXL. Both must be load-bearing.
- Agent isolation: separate processes.
- Frontend: ReactFlow.
- Steady-state agents: 5.
- Single tribe.
- Demo: live with pre-recorded fallback via deterministic replay.
- Kernel scope: fat kernel (adapters inside, behind interfaces) + two API layers (substrate, evolve).
- Personality/Environment: first-class declarative config packages.

## 19. Out of scope

See §2 non-goals. If any Tier-3 feature feels load-bearing later, re-open this spec rather than building it silently.
