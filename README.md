# MOIRAI — A Self-Evolving AI Civilization

> Autonomous agents live in a shared world, face crises, and invent survival skills through a cryptographically-gated reasoning pipeline on 0G Compute. Skills are stored permanently on 0G Storage, taught peer-to-peer over AXL, and inherited across generations. Every agent is a tradeable iNFT carrying its full intelligence history. Knowledge compounds. The civilization remembers.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                   BROWSER (React + Zustand)                  │
│   Agent canvas · Event feed · Receipts Gallery               │
│   Marketplace modal (iNFT listings + import)                 │
└───────────────────────────┬──────────────────────────────────┘
                            │ WebSocket (live events)
              ┌─────────────┴───────────────┐
              │           ENGINE            │
              │  Tick loop                  │
              │  Crisis scheduler           │
              │  Process supervisor         │
              │  iNFT minting + listing     │
              │  Marketplace import         │
              │  WS broadcaster             │
              └────┬──────────┬──────────┬──┘
              spawn│     spawn│     spawn│
           ┌───────▼─┐ ┌──────▼─┐ ┌─────▼───┐
           │ Agent A │ │Agent B │ │ Agent C │   ← real OS processes
           │ runtime │ │runtime │ │ runtime │
           │ +Kernel │ │+Kernel │ │ +Kernel │
           └───┬──┬──┘ └──┬──┬──┘ └──┬──┬──┘
               │  │       │  │       │  │
          AXL ◀┘  └───────┘  └───────┘  │   ← Gensyn P2P (cross-process)
                                         │
      ┌──────────────────────────────────▼──────────────────────┐
      │                  KERNEL ADAPTERS                        │
      │  IComputeAdapter  →  0G Compute  (TeeML sealed LLM)    │
      │  IStorageAdapter  →  0G Storage  (Indexer SDK)         │
      │  INetworkAdapter  →  AXL / Gensyn  (P2P messaging)     │
      └──────────────────────────────────┬──────────────────────┘
                                         │
                          ┌──────────────▼──────────────┐
                          │        0G NETWORK           │
                          │  Compute · Storage · Chain  │
                          └──────────────┬──────────────┘
                                         │
                          ┌──────────────▼──────────────┐
                          │   AgentNFT  (ERC-721)       │
                          │   AgentMarketplace          │
                          │   metadataRootHash          │
                          │     → 0G Storage blob       │
                          └─────────────────────────────┘
```

---

## Three-Part Architecture

Everything in Moirai composes from three orthogonal building blocks. Every file belongs cleanly to one of them.

### Kernel
The self-evolution substrate. Linked into every agent process. Exposes two API layers:

- **Substrate** — `kernel.compute.infer`, `kernel.storage.putSkill/getSkill/listSkills`, `kernel.net.whisper/broadcast/subscribe`
- **Evolution** — `kernel.evolve(crisis, context)` and `kernel.evaluateAdoption(skill)`

Three adapters live inside the kernel behind clean interfaces, dependency-injected at boot:

| Interface | Implementation | Role |
|---|---|---|
| `IComputeAdapter` | `ZeroGComputeAdapter` | Sealed LLM inference via `@0glabs/0g-serving-broker` |
| `IStorageAdapter` | `ZeroGStorageAdapter` | Persistent skill storage via `@0gfoundation/0g-ts-sdk` |
| `INetworkAdapter` | `AxlAdapter` | Real P2P messaging via Gensyn AXL |

Swapping any adapter is one constructor argument — no agent or engine code changes.

### Personality
A JSON config per agent: name, traits, risk tolerance, innate skills, inventory, and prompt fragments. These flow directly into every `evolve()` call. The `risk` field (0–1) shifts the acceptance threshold for proposed skills. Swap the JSON, get a fundamentally different agent.

```json
{
  "id": "alice",
  "name": "Alice",
  "traits": ["brave", "resourceful", "quick thinker"],
  "risk": 0.7,
  "promptFragments": {
    "reasoning": "You are bold and decisive when threatened. You prefer direct action.",
    "selfEval": "You are optimistic — accept plans that have a fighting chance."
  }
}
```

### Environment
A JSON config per world: physics rules, available resources, topology, and crisis schedule. Physics rules are injected verbatim into every `evolve()` prompt and into `skillResolvesCrisis()` — the function that determines whether a known skill can handle an active crisis. Swap `savannah.json` for `tundra.json` and the same engine runs an entirely different world.

---

## The Self-Evolution Kernel

When an agent faces a crisis with no matching skill, it calls `kernel.evolve()`. This is not a single LLM call — it is a four-step cryptographically-gated pipeline:

```
STEP 1 — REASON   (0G Compute, verifiable: true)
  Input:  personality traits + world physics + crisis
          + agent inventory + all known skills
  Output: candidate Skill { name, effect, steps, preconditions }
          + receipt hash (ZG-Res-Key header)
  Guard:  throws EvolveError if inference is non-verifiable

STEP 2 — SELF-EVALUATE   (0G Compute, verifiable: true, independent)
  Input:  world physics + candidate skill only
          (never sees the reasoning from Step 1)
  Output: { score: 0..1, failureModes: string[] }
          + receipt hash
  Guard:  throws EvolveError if inference is non-verifiable

STEP 3 — PERSONALITY GATE
  threshold = 0.6 - (personality.risk - 0.5) × 0.4
  Alice  (risk 0.7) → threshold 0.52
  Cautious agent (risk 0.2) → threshold 0.72
  Reckless agent (risk 0.9) → threshold 0.44

STEP 4 — PERSIST or REJECT
  Accept → upload JSON to 0G Storage → rootHash returned
           skill object stamped with reasonReceipt + selfEvalReceipt
           skill whispered to all live peers over AXL
  Reject → SKILL_REJECTED event emitted, crisis logged to failedCrises
```

Both receipt hashes are **mandatory fields** on the `Skill` type. No receipts = no skill = no entry into civilization.

### Skill Schema

```typescript
type Skill = {
  id: string;               // content hash
  name: string;
  description: string;
  preconditions: string[];
  effect: string;
  steps: string[];
  provenance: {
    inventedBy: string;       // agent id
    inventedAt: number;       // tick
    bornFrom: string[];       // crisis ids
    reasonReceipt: string;    // 0G Compute receipt hash — MANDATORY
    selfEvalReceipt: string;  // 0G Compute receipt hash — MANDATORY
    selfEvalScore: number;    // 0..1
  };
};
```

### Skill Adoption (Peer Teaching)

When an agent receives a `TEACH` message over AXL, it does not blindly accept the skill. It runs `kernel.evaluateAdoption()` — an independent inference scoring the offered skill against the receiving agent's own personality and environment. A cautious agent can decline a skill a reckless one invented and accepted.

---

## Event Flow — Crisis to Inheritance

```
Engine injects CRISIS_STARTED (tick N)
  │
  ▼
Agent scans knownSkills via skillResolvesCrisis()
  │
  ├── match found → AGENT_RESCUED (applies skill, no compute)
  │
  └── no match → kernel.evolve()
        │
        ├── REASONING_STARTED
        ├── [0G Compute call 1] → SKILL_PROPOSED + receipt_1
        ├── SELF_EVAL_STARTED
        ├── [0G Compute call 2] → SELF_EVAL_RESULT + receipt_2
        │
        ├── score < threshold → SKILL_REJECTED
        │
        └── score ≥ threshold → SKILL_ACCEPTED
              │
              ├── putSkill → 0G Storage → rootHash
              ├── AXL whisper to all live peers (skillId + rootHash)
              │     └── peer: evaluateAdoption() → SKILL_LEARNED or SKILL_DECLINED
              └── AGENT_RESCUED

Agent dies → AGENT_DIED
  │
  └── Engine spawns new agent with inheritedSkillRoots
        └── agent boot: listSkills() → indexer.download(rootHash) per skill
              └── SKILL_INHERITED (knowledge downloaded from 0G Storage)

Second crisis of same type
  └── inherited agent applies skill directly → AGENT_RESCUED (no compute)
```

---

## 0G + AXL Integration

### 0G Compute (`@0glabs/0g-serving-broker`)
- Service discovery: queries `broker.inference.listService()`, filters `verifiability: "TeeML"`
- Request headers generated by `broker.inference.getRequestHeaders(providerAddress)`
- After inference: `broker.inference.processResponse(providerAddress, chatID, usageData)` verifies the receipt
- Receipt hash extracted from `ZG-Res-Key` response header
- Retry logic: up to 5 attempts on 429 with exponential backoff (6s, 12s, 24s, 48s)
- Fallback: Anthropic or OpenAI on failure, skill marked `unverified`

### 0G Storage (`@0gfoundation/0g-ts-sdk`)
- Upload: `indexer.upload(MemData(skillJson), rpcUrl, signer)` → `{ rootHash, txSeq }`
- Download: `indexer.download(rootHash, filePath)` → parsed `Skill` JSON
- `rootHash` is the permanent content address — stored on skill, on iNFT, passed at agent spawn
- `seedSkillRoot(skillId, rootHash)` seeds the map at spawn time for inherited skills
- `flushEvents()` persists the full event log as a single blob on demand

### AXL / Gensyn
- Each agent process connects to its own AXL node with a unique PEM key identity
- `kernel.net.whisper(peerId, payload)` sends a real cross-process P2P message
- `kernel.net.topology()` returns live peer list — intersected with engine's alive agent list before teaching
- `kernel.net.subscribe(handler)` fires on every inbound AXL message

### iNFT — `AgentNFT` + `AgentMarketplace` (0G Chain EVM)
- `AgentNFT` is ERC-721. Each token carries `metadataRootHash` → 0G Storage content address
- The 0G Storage blob contains the agent's skills (with receipt hashes), traits, and world of origin
- `AgentMarketplace` handles `list()`, `delist()`, `buy()` entirely on-chain
- Engine listens for on-chain `Sold` events and spawns the purchased agent with `inheritedSkillRoots` pre-seeded from the NFT metadata
- `tokenURI()` returns a `data:application/json;base64` URI readable by on-chain explorers

---

## Package Layout

```
packages/
├── shared/           # All cross-package types: Skill, Event, Crisis,
│                     # Personality, Environment, Receipt
├── kernel/           # Kernel interface + adapter interfaces
│   └── adapters/interfaces.ts   # IComputeAdapter, IStorageAdapter, INetworkAdapter
├── kernel-impl/      # Real adapter implementations + evolve() logic
│   ├── adapters/
│   │   ├── 0g-compute.ts   # ZeroGComputeAdapter
│   │   ├── 0g-storage.ts   # ZeroGStorageAdapter
│   │   └── axl.ts          # AxlAdapter
│   ├── evolve.ts     # kernel.evolve() + evaluateAdoption()
│   └── prompts.ts    # Prompt builders (reason, self-eval, adoption)
├── personality/      # Personality loader + personalities/*.json
├── environment/      # Environment loader + worlds/*.json + skillResolvesCrisis()
├── engine/           # Tick loop, crisis orchestrator, process supervisor,
│                     # WS broadcaster, iNFT minting, marketplace integration
├── agent-runtime/    # Per-agent process: decision loop, AXL handling,
│                     # boot/tick/die message handler
├── inft/             # iNFT adapter, marketplace adapter, metadata builder
├── contracts/        # AgentNFT.sol (ERC-721) + AgentMarketplace.sol
├── web/              # React visualizer: canvas, event feed,
│                     # Receipts Gallery, Marketplace modal
└── demo-controller/  # CLI to trigger crises and control simulation
```

---

## Setup & Running

### Prerequisites
- Node 20+, pnpm
- Docker (for AXL mesh)
- Environment variables: `ZG_RPC_URL`, `ZG_PRIVATE_KEY`, `ZG_INDEXER_URL`
- Optional iNFT: `INFT_CONTRACT_ADDRESS`, `MARKETPLACE_CONTRACT_ADDRESS`

### Run

```bash
# 0. Install dependencies
pnpm install
# 1. Generate AXL peer keys and start the P2P mesh
pnpm axl:mesh:keys
pnpm axl:mesh:up

# 2. Verify AXL mesh is healthy
bash scripts/axl-mesh-check.sh

# 3. Start the frontend (separate terminal)
pnpm web

# 4. Start the engine + agent processes (separate terminal)
pnpm engine

# 5. Tear down AXL mesh when done
pnpm axl:mesh:down
```

`pnpm web` and `pnpm engine` must run in separate terminals.

---

## Example Agent — Full Decision Loop

`packages/agent-runtime/src/index.ts` is the canonical working agent. It:

1. Loads personality JSON and instantiates the kernel with real 0G + AXL adapters
2. On `BOOT`: seeds inherited skill rootHashes, connects to AXL, downloads inherited skills from 0G Storage
3. On `TICK`: scans known skills via `skillResolvesCrisis()` — if no match, calls `kernel.evolve()`
4. On skill accepted: whispers skillId + rootHash to all live peers over AXL
5. On AXL `TEACH` message: fetches skill from 0G Storage, runs `evaluateAdoption()`, emits `SKILL_LEARNED` or `SKILL_DECLINED`
6. On `DIE`: disconnects AXL cleanly and exits

```typescript
// Crisis arrives with no matching skill → evolve
const result = await kernel.evolve({
  personality,
  environment,
  crisis,
  context: { agentId, tick, inventory, knownSkillIds },
  knownSkills,
});

if (result.status === "accepted") {
  // Teach all live peers over AXL
  for (const peer of peers) {
    await kernel.net.whisper(peer, {
      kind: "TEACH",
      skillId: result.skill.id,
      rootHash: storageAdapter.getSkillRoot(result.skill.id),
    });
  }
}
```

---

## Tech Stack

| Layer | Choice |
|---|---|
| Language | TypeScript (Node 20+) — end-to-end, shared types |
| Monorepo | pnpm workspaces + Turborepo |
| Agent isolation | One OS process per agent (AXL does real P2P) |
| Hero LLM | 0G Compute — TeeML sealed inference, verifiable receipts |
| Background LLM | Anthropic / OpenAI (adoption eval, fallback) |
| Storage | 0G Storage via `@0gfoundation/0g-ts-sdk` Indexer |
| P2P comms | AXL / Gensyn (genuine cross-process messaging) |
| Smart contracts | Solidity on 0G Network EVM |
| Frontend | Vite + React + Zustand |
| UI transport | WebSocket (engine → browser) |

---

## Acceptance Event Sequence (Smoke Test)

A successful end-to-end run produces this event sequence in order:

```
CRISIS_STARTED → REASONING_STARTED → SKILL_PROPOSED → SELF_EVAL_RESULT
→ SKILL_ACCEPTED → AXL_MESSAGE → SKILL_LEARNED → AGENT_DIED
→ AGENT_SPAWNED → SKILL_INHERITED → CRISIS_RESOLVED
```
