# Moirai — How the Village Works

## Overview

Moirai is an agent-village simulation where autonomous LLM-backed agents live, survive, learn skills, teach each other, and pass knowledge to future generations. Each agent runs as its own Node.js process. The engine ticks the world forward, injects crises, and supervises the agents.

---
 RUN
  pnpm --filter @moirai/shared build && pnpm --filter @moirai/agent-runtime --filter @moirai/engine build
# 1. Generate keys for all 5 nodes (skips existing ones)
  pnpm axl:mesh:keys

  # 2. Restart the mesh with the 2 new nodes (dave + eve)
  docker compose -f docker-compose.axl.yml down
  pnpm axl:mesh:up   # builds image + starts all 5 containers

  # 3. (Optional) verify all 5 nodes are up
  bash scripts/axl-mesh-check.sh

  # 4. Run the live simulation
  pnpm --filter @moirai/engine sim-live


---

## Architecture

```
Engine (orchestrator process)
  ├── Tick loop — increments world time, fires crises, decays needs
  ├── Supervisor — spawns/kills agent child processes via fork()
  ├── PeerRouter — routes whisper/broadcast messages between agents
  ├── SkillCache — in-memory index of known skill IDs for APPLY_SKILL
  ├── CommunityGraph — in-memory bilateral bond map (rebuilt from events)
  └── EventBus — in-process event log; WebSocket bridge sends to browser

Agent (one Node.js process per agent)
  ├── Kernel — compute / storage / network adapters
  │   ├── DevComputeAdapter — canned LLM responses (dev mode)
  │   ├── DevStorageAdapter — file-based shared storage (/tmp/moirai-dev/)
  │   └── DevIpcNetworkAdapter — routes messages via engine IPC
  ├── EventQueue — priority-sorted inbound event queue
  ├── SkillSet — in-memory skill inventory for this agent
  ├── ActivityQueue — tracks ongoing multi-tick activities
  └── DecisionLoop — handleTick / handleCrisis / handlePeerMessage
```

---

## The World

World: **savannah** (`packages/environment/worlds/savannah.json`)

- Field: 100×60 units, open topology
- Resources: rocks, sticks, berries, water, grass
- Physics rules fed into LLM prompts: "rocks fly when thrown", "lions fear pointy things", etc.
- Each agent starts with `inventory: ["rocks", "sticks"]`, `hunger: 20`, `energy: 80`, `food: 10`

**Needs decay per tick:**
| Need | Change |
|------|--------|
| hunger | +3/tick (if food stock = 0), −5/tick (if food stock > 0) |
| curiosity | +1/tick always; +5 when resting with food |
| energy | cost depends on action; +15 on REST |

Death threshold: `hunger ≥ 100`.

**Hidden rules** (discoverable by agents):
- `dawn-forage`: foraging on a tick divisible by 20 yields ×2 berries
- `group-farm`: farming when 2+ agents are farming simultaneously yields ×3 food
- `rest-curiosity`: resting while well-fed doubles curiosity gain

**Crisis schedule** (default savannah):
- Tick 40: Lion stalks alice and bob (deadline: 12 ticks)
- Tick 140: Second lion at the watering hole (deadline: 10 ticks)

---

## Agents

Five seed personalities:

| ID | Name | Traits | Risk |
|----|------|--------|------|
| alice | Alice | cautious, observant, patient | 0.30 |
| bob | Bob | bold, fast, competitive | 0.75 |
| cara | Cara | curious, creative, experimental | 0.60 |
| dave | Dave | strategic, social, memory-keeper | 0.50 |
| eve | Eve | wandering, self-reliant, quiet | 0.45 |

Alice, Bob, Cara spawn at startup. Dave and Eve are the inheritor pool — they spawn after deaths.

Risk tolerance affects the skill acceptance threshold: `threshold = 0.6 − (risk − 0.5) × 0.4`. Bob (risk 0.75) accepts skills scoring ≥ 0.50; Alice (risk 0.30) requires ≥ 0.68.

---

## The Tick Loop

Every tick the engine:
1. Increments `world.tick`
2. Runs the crisis orchestrator — injects any scheduled crises, sends `CRISIS` IPC to affected agents
3. Expires overdue crises (deadline passed → `outcome: expired`)
4. Replenishes the shared food pool by 1
5. For each alive agent: decays needs; kills if `hunger ≥ 100`; otherwise sends `TICK` IPC with agent's position and nearby agents
6. On death: sends `DEATH_WARNING` peer message to all community members; spawns next inheritor if the pool is non-empty
7. Emits `WORLD` state snapshot to browser every 4 ticks

Default tick interval: 250 ms. Configurable via `MOIRAI_TICK_MS`.

---

## The Decision Loop (per agent)

### Priority Queue

Incoming events are queued with priority before processing. A single draining loop processes them in order, never concurrently:

| Priority | Event |
|----------|-------|
| 1 | `DEATH_WARNING` peer message |
| 2 | `TEACH` peer message (elevated when a crisis is pending) |
| 3 | `CRISIS` |
| 4 | `TEACH` peer message (normal) |
| 5 | `TICK` |

### On TICK

1. If an activity is in progress (FORAGE/FARM/REST/EXPERIMENT — multi-tick), send its action and return.
2. Otherwise call `compute.infer(reasonPrompt)` — a cheap LLM call describing needs, skills, nearby agents.
3. Parse the intended action (e.g. "find berries", "rest and recover").
4. If a known skill covers the intended action, apply it (start the activity, increment use count).
   - If the skill has been used ≥ 8 times and curiosity ≥ 65, kick off `kernel.evolve()` in the background to improve it (curiosity-driven growth).
5. Otherwise call `kernel.evolve()` to create a new skill.

### On CRISIS

1. Interrupt any ongoing activity.
2. Check if any known skill resolves this crisis type (keyword overlap check). If yes, apply it immediately.
3. If not, call `kernel.evolve()` with the crisis context and caution suffix (see below).
4. Apply the accepted skill and resume activity queue.

### Skill Evolution via `kernel.evolve()`

```
REASONING_STARTED
→ compute.infer(reasonPrompt, verifiable: true)  [0G Compute in production]
→ SKILL_PROPOSED
→ SELF_EVAL_STARTED
→ compute.infer(evalPrompt, verifiable: true)    [0G Compute in production]
→ SELF_EVAL_RESULT (score 0.0–1.0)
→ score ≥ threshold → storage.putSkill() → SKILL_ACCEPTED → broadcast to all peers
→ score < threshold → SKILL_REJECTED
```

Accepted skills are written to 0G Storage (dev: `skills.json`) and broadcast over AXL.

### On DEATH_WARNING peer message

When a community member dies, surviving members receive the death context:
- Which crises the deceased faced
- Cause of death
- The last skill they attempted and its effect

This is stored as a `CautionEntry` in the agent's in-memory caution list. On the next evolve call for that crisis type, the caution suffix is appended to the prompt: *"a community member just died — they tried X and it failed. Find a different approach."*

Proactive evolve: if the surviving agent has no skill for a crisis their peer just died from, they immediately kick off `kernel.evolve()` in the background to prepare.

### On TEACH peer message

1. If the agent already has this skill, ignore.
2. If the agent has a better overlapping skill (keyword overlap > 50% and equal/better score), emit `SKILL_REJECTED_BY_PEER` and skip.
3. Run LLM-based acceptance: the agent's personality, traits, and risk tolerance decide whether to adopt the skill.
   - Fallback if LLM fails: accept if sender is a known community member.
4. On accept: store the skill, update agent inventory, bond the sender into the social graph (`SOCIAL_GRAPH_UPDATED`), emit `SKILL_ACCEPTED_FROM_PEER` + `SKILL_LEARNED`.
   - If the agent has the "curious" trait, trigger a follow-up `evolve()` to improve on what they just learned.

---

## Social Graph & Community

The social graph is **per-agent** and stored in 0G Storage (dev: `socialGraph.json`). It's built organically:
- Accepting a TEACH message from someone bonds that person into your graph.
- On spawn, an agent loads its stored graph and reports it to the engine (`SOCIAL_GRAPH_LOADED`).
- The engine maintains a lightweight in-memory dispatch cache (`communityGraph`) rebuilt from these events.

Community membership controls two things:
1. **Death warnings**: only sent to known community members.
2. **Peer trust**: inCommunity agents get a higher default acceptance rate if LLM inference fails.

---

## Skill Inheritance on Birth

When a new agent spawns, the engine sends the IDs of proximity-based predecessors (nearby alive agents at spawn time). The new agent's `inheritOnSpawn` function:
1. Reads each predecessor's inventory from storage
2. Fetches each skill from storage
3. Adds it to the agent's skill set and emits `SKILL_INHERITED`

This means skills propagate through proximity, not lineage — a new agent learns from whoever is nearby when it arrives.

---

## Storage Layout (dev mode)

All agents share a single directory (set via `MOIRAI_DEV_STORAGE`, default `/tmp/moirai-dev`):

```
/tmp/moirai-dev/
  skills.json        — array of all Skill objects (append-only, locked writes)
  events.json        — array of DomainEvent objects (for audit)
  inventories.json   — map of agentId → skillId[]
  socialGraph.json   — map of agentId → memberId[]
```

File writes use atomic rename + directory-based locking to prevent corruption from concurrent agent processes.

---

## How to Run

### Prerequisites

```bash
node --version   # ≥ 20
pnpm --version   # ≥ 9
pnpm install
```

### Simulation (interactive terminal)

```bash
pnpm sim                          # fresh run, 200 ticks at 250ms each
pnpm sim -- --verbose             # show all events including WORLD_TICK
pnpm sim -- --resume              # resume last episode from disk
MOIRAI_MAX_TICKS=50 MOIRAI_TICK_MS=80 pnpm sim   # faster short run
```

Output shows phases: `VILLAGE LOOP`, `CRISIS`, `SELF-EVOLUTION`, `PEER TEACHING`, `INHERITANCE`.

Ctrl+C stops and prints a recap scoreboard.

### Smoke Test

Runs a headless 200-tick simulation (50ms ticks) with a forced alice death at tick 20 and two inheritors. Asserts the required event sequence:

```bash
pnpm smoke
```

Required milestones (in order of appearance, not strict ordering):
`REASONING_STARTED → SKILL_PROPOSED → SELF_EVAL_RESULT → (SKILL_ACCEPTED|SKILL_REJECTED) → AXL_MESSAGE → SKILL_REJECTED_BY_PEER → CRISIS_STARTED → CRISIS_RESOLVED → AGENT_DIED → AGENT_SPAWNED`

Plus lifecycle assertions: at least one death, one spawn, and one crisis terminal event (resolved or expired).

### Typecheck

```bash
pnpm typecheck    # runs tsc --noEmit across all packages
```

### Environment Variables

| Variable | Default | Effect |
|----------|---------|--------|
| `MOIRAI_TICK_MS` | `250` | Milliseconds per tick |
| `MOIRAI_MAX_TICKS` | `200` | Stop after this many ticks |
| `MOIRAI_AGENTS` | `alice,bob,cara` | Comma-separated initial agent IDs |
| `MOIRAI_INHERITORS` | `dave,eve` | Agents spawned after deaths |
| `MOIRAI_FORCED_DEATHS` | `alice:80` | Force-kill agentId at tick (comma-separated) |
| `MOIRAI_DEV_STORAGE` | `/tmp/moirai-dev` | Shared file storage directory for dev adapters |
| `MOIRAI_EPISODE_DIR` | `/tmp/moirai-episodes` | Where episode snapshots are saved |
| `MOIRAI_WS_PORT` | `7717` | WebSocket port for browser bridge (`0` = disabled) |
| `MOIRAI_KERNEL_MODE` | `dev` | `prod` to load real 0G+AXL kernel |

---

## Key Event Types

| Event | Emitter | Meaning |
|-------|---------|---------|
| `WORLD_TICK` | engine | Tick counter advanced |
| `CRISIS_STARTED` | engine | A crisis was injected |
| `CRISIS_RESOLVED` | engine | Crisis resolved by skill or expired |
| `AGENT_SPAWNED` | engine | Agent process started |
| `AGENT_DIED` | engine | Agent hunger hit 100 or forced death |
| `REASONING_STARTED` | kernel | evolve() began reasoning |
| `SKILL_PROPOSED` | kernel | LLM proposed a candidate skill |
| `SELF_EVAL_RESULT` | kernel | Score returned from self-evaluation |
| `SKILL_ACCEPTED` | kernel | Score passed threshold; skill persisted |
| `SKILL_REJECTED` | kernel | Score below threshold; skill discarded |
| `AXL_MESSAGE` | engine | Agent broadcast or whispered over AXL |
| `SKILL_TAUGHT` | agent | Agent broadcast a skill to peers |
| `SKILL_ACCEPTED_FROM_PEER` | agent | Agent accepted a skill from a peer |
| `SKILL_REJECTED_BY_PEER` | agent | Agent rejected a peer's skill |
| `SKILL_LEARNED` | agent | Skill added to agent inventory from peer |
| `SKILL_INHERITED` | agent | Skill inherited from predecessor on birth |
| `SOCIAL_GRAPH_UPDATED` | agent | New community bond formed |
| `DEATH_WARNING` | agent | Community member died; context propagated |
| `CURIOSITY_EVOLVED` | agent | Curious agent improved on a known skill |
| `FOOD_GATHERED` | engine | FORAGE or FARM action completed |
| `HIDDEN_RULE_DISCOVERED` | engine | Agent triggered a hidden world rule |


##
