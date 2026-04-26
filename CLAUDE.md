# emergent-civ — project context

Autonomous LLM-backed agents live in a shared world. When they face a crisis they have no skill for, they reason via **0G Compute** sealed inference, self-evaluate through a second sealed inference, write the verified skill to **0G Storage**, and teach peers over **AXL** (Gensyn). When an agent dies, its skills persist on 0G Storage and are inherited by future agents.

Hackathon: Open Agents. Target sponsor prizes: **0G (Storage + Compute)** and **AXL** — both must be load-bearing. 2 developers, ~160h total.

**Status:** Design spec complete, nothing built yet. Full spec at `docs/superpowers/specs/2026-04-24-civilisation-emergence-design.md` — read it first.

---
before diving deep into the codebase, you have to be very minimal and avoid any overengineering or unnecessary things.

DON'T GO THROUGH PROJECT STRUCTURE AND ARCHITECTURE AGAIN AND AGAIN
DON'T do any git commit
---

## Three-part architecture

The system is shaped around three concepts. Everything you write should belong cleanly to one of them (or to the orchestration glue around them).

1. **Kernel** — the substrate. Unified API for *compute* (0G Compute), *persistence* (0G Storage), *sharing* (AXL peer comms). Owns the self-evolution loop `evolve()`. Linked into every agent process. Adapters live inside the kernel behind interfaces (`IComputeAdapter`, `IStorageAdapter`, `INetworkAdapter`), DI'd at boot.
   - **Substrate layer** (low-level): `kernel.compute.infer`, `kernel.storage.{put,get,list}`, `kernel.net.{whisper,broadcast,subscribe}`.
   - **Self-evolution layer** (hero): `kernel.evolve(crisis, context)` runs reason → self-eval → accept/reject → persist → broadcast.

2. **Personality** — declarative per-agent identity: name, traits, risk tolerance, innate skills, prompt fragments. JSON config, hot-swappable.

3. **Environment** — declarative world config: physics rules, resources, topology, crisis schedule. JSON config, hot-swappable.

The **engine** is orchestration glue (tick loop, crisis injection, process supervision, WebSocket) — not one of the three concepts.

---

## Tech stack (locked)

| Layer | Choice |
|---|---|
| Language | TypeScript (Node 20+) end-to-end |
| Monorepo | pnpm workspaces + Turborepo |
| Agent isolation | One Node process per agent on localhost (real AXL peer-to-peer) |
| Hero LLM | 0G Compute (sealed) for evolve() inferences |
| Background LLM | Cheap Anthropic/OpenAI call (cost control) |
| Frontend | Vite + React + ReactFlow + Zustand |
| UI transport | WebSocket (engine → browser) |
| Local mirror | SQLite (for fast ticks; 0G Storage is authoritative) |

Rejected (do not reopen): Python backend, Rust/Go, agents-as-actors-in-one-process, thin kernel with separate adapter packages.

---

## Package layout

```
packages/
├── shared/              # Types: Skill, Event, Crisis, Personality, Environment, Receipt
├── kernel/              # Substrate + evolve() + adapters (behind interfaces)
│   ├── adapters/{0g-compute,0g-storage,axl}.ts
│   ├── substrate.ts
│   ├── evolve.ts
│   └── index.ts         # kernel factory, DI
├── personality/         # Schema + personalities/*.json + loader
├── environment/         # Schema + worlds/*.json + physics.ts + loader
├── engine/              # Tick loop, crisis orchestrator, process supervisor, WS
├── agent-runtime/       # Per-agent program. Loads personality, runs kernel.
├── web/                 # ReactFlow visualiser
└── demo-controller/     # CLI trigger
```

---

## Build order (agreed)

Sequential with concurrency noted. Real infrastructure from day 1 — no mocks until the very end.

1. **Day-1 spikes** — round-trip all three SDKs (0G Compute, 0G Storage, AXL) in parallel. Spikes graduate into real adapters. If any is broken after ~2h, decide on sidecar fallback now.
2. **Foundation** — monorepo scaffold, `shared/` types.
3. **Real adapters** (one at a time, real from moment of creation):
   - `kernel/adapters/0g-storage.ts`
   - `kernel/adapters/0g-compute.ts` — **on seeing the real receipt shape, update `Skill.provenance` in `shared/` to match.**
   - `kernel/adapters/axl.ts`
4. **Kernel** (substrate + `evolve()`) — concurrent with steps 5 + 6. Hits real infra.
5. **Engine** (tick loop, crisis orchestrator, process supervisor, WS) — concurrent with 4 + 6.
6. **Agent-runtime** (decision loop, teach/learn, kernel integration) — concurrent with 4 + 5.
7. **Personalities** — formalise into `personality/` config package, 5 seed personas. Until now, kept inline as a hardcoded single persona to make the core runnable.
8. **Environment** — formalise into `environment/` config package, savannah + lion crisis schedule. Until now, inline.
9. **Real end-to-end smoke test** — headless run of the lion scenario against real 0G + real AXL. Acceptance event sequence must appear in order (see spec §3). This is the "system works" milestone.
10. **Visualizer** — ReactFlow graph, event feed, Receipts Gallery (with real receipt hashes), inheritance badges.
11. **Mocks for testing + replay adapter** — at the end, not the start. Built from observed behaviour of real adapters. Replay adapter is the demo fallback.
12. **Demo polish** — `demo-controller/` CLI, canonical run capture, rehearsal, video backup, scope cut.

---

## Critical conventions

- **Real-first, not mock-first.** Sponsor tech IS the product. Build adapters against real SDKs immediately. Mocks exist only for tests and demo replay, built at the end from observed real behaviour. Do not guess receipt shapes, message formats, or latency profiles.
- **Adapters behind interfaces.** Every adapter implements `IComputeAdapter` / `IStorageAdapter` / `INetworkAdapter`. The kernel depends on interfaces, not concrete classes. Swapping to sidecar/mock/replay is a one-line DI change.
- **Hardcode, then extract.** During steps 4–6, personality and environment data lives inline in the code. Formalise into config packages only after the core loop is proven. Prevents designing config schemas for requirements we don't understand yet.
- **`shared/` is sacred.** Any change requires a sync between devs. Schemas pinned early.
- **0G Compute only where verifiability matters.** Hero decisions in `evolve()` use sealed inference. Routine tick decisions use the cheap background LLM. Budget awareness.
- **Every skill carries two receipts.** `Skill.provenance.reasonReceipt` + `selfEvalReceipt` — both mandatory, both from real 0G Compute. No placeholder receipts ever.
- **Events are the public contract.** Everything user-visible (including the acceptance test) flows through the `Event` union. Don't add UI behaviour that listens to non-events.

---

## Demo target (what we're building toward)

A 90-second live run:

1. 5 agents spawn, wander.
2. Lion appears near Agent A.
3. A calls `kernel.evolve()` → first 0G Compute receipt flashes into the Receipts Gallery. Candidate skill "throw sharp rocks" proposed.
4. Self-eval sealed inference: score ≥ 0.6 → accepted. Second receipt. Skill written to 0G Storage.
5. A whispers skill id to B over AXL (animated edge). B reads skill from 0G Storage, learns it.
6. Both survive the lion.
7. A dies later. Skill persists on 0G Storage.
8. Agent D spawns fresh. On init, inherits skill from 0G Storage (visible badge).
9. Second lion appears. D applies inherited skill without reasoning. Survives.
10. Camera on Receipts Gallery — every skill has a verifiable provenance chain.

Acceptance event sequence (smoke test asserts this in order):
`CRISIS_STARTED → REASONING_STARTED → SKILL_PROPOSED → SELF_EVAL_RESULT → SKILL_ACCEPTED → AXL_MESSAGE → SKILL_LEARNED → AGENT_DIED → AGENT_SPAWNED → SKILL_INHERITED → CRISIS_RESOLVED`

---

## Non-goals (explicit — do not build)

Economy, trade, currency, shelter, architecture, writing, maps, territory, factions, reproduction/genetics, multi-world, viewer betting, Twitch integration, mobile, auth, accounts, tilemap, sprites, pathfinding, combat animations. If one starts to feel load-bearing, re-open the spec — don't just add it.

Tier-2 features (second crisis, skill composition, reputation, lossy teaching) are only built if the core loop ships by hour ~100. Not before.

---

## Where to look

- **Full design spec:** `docs/superpowers/specs/2026-04-24-civilisation-emergence-design.md`
- **End-to-end flow trace (lion scenario, per-folder):** spec §10
- **Ownership table (who owns what):** spec §11
- **Hour budget:** spec §15
- **Risks + day-1 de-risking:** spec §16

Read the spec before writing code. Ask before changing anything in `shared/`.

--------------------------------------------------------------------------------------------
Moirai Codebase — Architecture Summary

  Project: Agent-village simulation (TypeScript monorepo, packages/)

  ---
  Package Map

  ┌───────────────┬────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │    Package    │                                                              Role                                                              │
  ├───────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ shared        │ Type definitions only — Skill, Crisis, Personality, WorldState, IPC messages, events                                           │
  ├───────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ kernel        │ Interface contracts only — IComputeAdapter, IStorageAdapter, INetworkAdapter. Real 0G adapters are external.                   │
  ├───────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ personality   │ 5 JSON configs (alice/bob/cara/dave/eve): traits, risk, innate skills, prompt fragments                                        │
  ├───────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ environment   │ World configs (one: savannah.json) with physics rules + crisis schedule. One helper: skillResolvesCrisis() via keyword overlap │
  ├───────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ engine        │ Orchestrator: tick loop, crisis injection, agent process supervision, WebSocket bridge                                         │
  ├───────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ agent-runtime │ Per-agent child process: loads personality, runs decision loop, manages skill set                                              │
  └───────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

  ---
  What's Implemented

  - Tick loop — engine ticks every N ms, increments hunger per agent, fires scheduled crises
  - Decision loop — crisis arrives → check known skills → if none, call kernel.evolve() → learn new skill → whisper to random peer → peer inherits
  - Hunger system — linear increment only; agent dies at threshold; dead agent stays in map (alive: false)
  - Crisis orchestrator — schedule-based injection ({ tick, type, targets, deadlineTicks }); deadline expiry handled in tick
  - Dev adapters — fake LLM (DevComputeAdapter), file-based storage (/tmp/moirai-dev/skills.json + events.json), IPC peer messaging
  - Skill persistence — skills survive process restarts via dev storage; new agents inherit all stored skills on spawn
  - Agent lifecycle — spawn → tick → death → respawn from inheritorPool personality pool
  - World state shape — { tick, agents: Record<id, {position, alive, hunger, inventory}>, activeCrises[] }
  - Inventory — each agent starts with ["rocks", "sticks"]; no consumption logic

  ---
  Key Files

  - packages/agent-runtime/src/decisionLoop.ts — full agent decision logic
  - packages/engine/src/index.ts — tick loop + agent lifecycle
  - packages/engine/src/world.ts — world primitives (spawn, kill, crisis list)
  - packages/engine/src/crisisOrchestrator.ts — crisis scheduling
  - packages/shared/src/types/world.ts — WorldState and AgentInWorld types
  - packages/agent-runtime/src/__dev__/devKernel.ts — simulated evolve() + self-eval logic
  - packages/agent-runtime/src/__dev__/devStorage.ts — file-based skill/event persistence

