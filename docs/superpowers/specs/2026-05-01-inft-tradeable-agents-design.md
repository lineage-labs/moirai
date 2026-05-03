# iNFT Tradeable Agents — Implementation Design

**Date:** 2026-05-01  
**Scope:** Make moirai agents tradeable as intelligent NFTs (ERC-7857 / 0G iNFT) across simulation worlds.

---

## 1. Goal

Each agent instance is minted as an iNFT at spawn time. Its learned skills are committed on-chain as encrypted metadata stored on 0G Storage. A marketplace lets engine operators (and ultimately users in the UI) buy or lease idle agents. Sold agents arrive in the buyer's world pre-loaded with their skill set; deceased agents become dormant tokens with a provenance trail.

This is the demo story: an agent survives a lion by learning "throw sharp rocks", gets listed, is bought by another world's engine, and that world's next lion crisis is survived by the imported agent using the inherited skill — without any reasoning call.

---

## 2. On-chain contracts

Two contracts, both on 0G EVM (Galileo testnet for hackathon).

### 2.1 iNFT contract (ERC-7857)

Use the 0G iNFT SDK — do not hand-roll ERC-7857. The SDK exposes:

```ts
mint(to, metadataHash, encryptedMetadataUri)  → tokenId
transfer(tokenId, from, to)                    → receipt (goes through TEE oracle)
authorizeUsage(tokenId, lessee, durationSecs)  → receipt
revokeUsage(tokenId, lessee)
setMetadata(tokenId, newHash, newUri)          → called after each SKILL_ACCEPTED
```

All oracle round-trips are handled inside the SDK — no manual TEE calls needed.

The engine's ZG_PRIVATE_KEY wallet is the owner of every token minted for that engine's agents.

### 2.2 Marketplace contract (lightweight)

A listing registry and payment coordinator. Engine operators list agents via the engine HTTP endpoint; the buyer engine pays and imports via its own engine HTTP endpoint — no wallet in the browser, no engine-to-engine direct calls.

All trade terms live in the `Listing` struct. iNFT metadata carries only agent state (skills, status), never market terms.

```solidity
struct Listing {
  uint256 tokenId;
  address sellerEngine;       // engine wallet that listed
  uint256 salePriceWei;
  uint256 leasePriceWei;      // future: 0 for now
  uint256 leaseDurationSecs;  // future: 0 for now
  bool    active;
  bytes32 worldId;
}

function list(tokenId, salePriceWei, worldId)   // lease params omitted until implemented
function delist(tokenId)
function buy(tokenId) payable                    // called by buyer engine wallet, emits Sold

// Future:
// function lease(tokenId) payable
event Listed(tokenId, sellerEngine, worldId, salePriceWei)
event Sold(tokenId, buyer)
// Future: event Leased(tokenId, lessee, until)
```

For the hackathon, deploy both contracts once and hard-code their addresses in env vars.

---

## 3. iNFT metadata schema

Metadata lives as a JSON blob on 0G Storage, encrypted under the iNFT contract's TEE key. The `metadataHash` committed on-chain is `sha256(blob)`.

```ts
// packages/inft/src/types.ts
export type AgentNFTMetadata = {
  schemaVersion: 1;

  // Identity
  agentId:        string;          // "alice", "dave-2", etc.
  personalityId:  string;          // maps to personality/*.json
  worldId:        string;          // WORLD_ID env var

  // Lineage
  tokenId:        string;          // current ERC-721 tokenId (hex)
  ancestorTokenIds: string[];      // all prior tokenIds in this lineage
  spawnTick:      number;

  // Capabilities — references only; full skill objects are fetched from 0G Storage on spawn
  skills: Array<{
    id:       string;   // used as inheritedSkillRoots key
    name:     string;   // display only (marketplace UI)
    rootHash: string;   // 0G Storage rootHash — sufficient to download full skill
  }>;

  // Status
  status: "alive" | "dormant";     // dormant = agent died
  deathTick?:    number;
  deathReason?:  string;           // "hunger" | "crisis:LION" | "sold"
};
```

---

## 4. New package: `packages/inft/`

```
packages/inft/
├── src/
│   ├── types.ts              # AgentNFTMetadata (above)
│   ├── inft-adapter.ts       # wraps 0G iNFT SDK
│   ├── marketplace-adapter.ts # wraps marketplace contract
│   └── index.ts              # exports
├── package.json
└── tsconfig.json
```

### 4.1 `inft-adapter.ts`

```ts
export class INFTAdapter {
  // ZG_PRIVATE_KEY wallet, INFT_CONTRACT_ADDRESS from env
  constructor(rpcUrl: string, contractAddress: string, privateKey: string)

  async mint(agentId: string, metadata: AgentNFTMetadata): Promise<string>
  // Returns tokenId. Stores encrypted metadata on 0G Storage, commits hash on-chain.

  async updateMetadata(tokenId: string, metadata: AgentNFTMetadata): Promise<void>
  // Called on SKILL_ACCEPTED. Re-encrypts and re-commits.

  async setDormant(tokenId: string, metadata: AgentNFTMetadata): Promise<void>
  // Sets status:"dormant", calls updateMetadata.

  async transfer(tokenId: string, toAddress: string): Promise<string>
  // Returns tx hash. Triggers oracle TEE flow via SDK.

  async authorizeUsage(tokenId: string, lesseeAddress: string, durationSecs: number): Promise<string>

  async readMetadata(tokenId: string): Promise<AgentNFTMetadata>
  // Used by spawnFromNFT to load skills.
}
```

### 4.2 `marketplace-adapter.ts`

```ts
export class MarketplaceAdapter {
  constructor(rpcUrl: string, contractAddress: string, privateKey: string)

  async list(tokenId: string, opts: {
    priceWei: bigint;
    leasePriceWei: bigint;
    leaseDurationSecs: number;
    worldId: string;
  }): Promise<void>

  async delist(tokenId: string): Promise<void>

  async getActiveListings(): Promise<Listing[]>
  // Reads on-chain events + filters active=true

  async buy(tokenId: string, valueWei: bigint): Promise<string>
  // Buyer engine calls this. Returns tx hash.

  async lease(tokenId: string, valueWei: bigint): Promise<string>
}
```

---

## 5. Engine changes

### 5.1 New env vars

```
ZG_PRIVATE_KEY=              # engine wallet (already exists for storage/compute)
INFT_CONTRACT_ADDRESS=       # deployed iNFT contract
MARKETPLACE_CONTRACT_ADDRESS=
ORACLE_URL=                  # 0G oracle endpoint (from 0g iNFT SDK docs)
WORLD_ID=savannah            # unique per world instance
```

### 5.2 Extended `AgentEntry`

```ts
type AgentEntry = {
  id: string;
  proc: ChildProcess;
  alive: boolean;
  knownSkillIds: Set<string>;
  hunger: number;
  hungerConfig?: { rate: number; threshold: number };
  // NEW:
  tokenId?: string;          // set after mint completes
  listed: boolean;           // currently listed on marketplace
  sold: boolean;             // sold — skip replacement spawn
};
```

### 5.3 Spawn paths and when to mint

There are three distinct spawn paths. Only the first two mint a new token.

| Path | Trigger | iNFT action |
|---|---|---|
| Initial boot | `spawnAgent("alice")` | **mint** new tokenId |
| Replacement after death | `spawnAgent("dave", ..., ancestorTokenIds=["alice-token"])` | **mint** new tokenId — dave is a new on-chain entity; alice's token is dormant |
| Import (bought agent) | `spawnFromNFT(tokenId)` | **no mint** — token already transferred to this engine's wallet; attach existing tokenId |

`spawnAgent` takes an optional `existingTokenId` parameter. When set, the mint is skipped:

```ts
async function spawnAgent(
  id: string,
  inheritedSkillRoots: Record<string, string> = {},
  ancestorDeaths: Array<{ agentId: string; reason: string }> = [],
  ancestorTokenIds: string[] = [],
  existingTokenId?: string,          // set only on import — skips mint
): Promise<void> {
  // ... existing proc spawn code ...

  if (existingTokenId) {
    entry.tokenId = existingTokenId;
    broadcast({ kind: "AGENT_IMPORTED", tick, actorId: id, payload: { tokenId: existingTokenId } });
  } else {
    const metadata: AgentNFTMetadata = {
      schemaVersion: 1,
      agentId: id,
      personalityId: id,
      worldId: WORLD_ID,
      tokenId: "",
      ancestorTokenIds,
      spawnTick: tick,
      skills: [],
      status: "alive",
    };
    // Mint async — don't block spawn
    inftAdapter.mint(id, metadata).then((tokenId) => {
      entry.tokenId = tokenId;
      broadcast({ kind: "AGENT_MINTED", tick, actorId: id, payload: { tokenId } });
    }).catch(console.error);
  }
}
```

Replacement spawn: `spawnAgent(nextId, inheritedSkillRoots, [...], [entry.tokenId].filter(Boolean))` — no `existingTokenId`, so a new token is minted.

`spawnFromNFT` passes the existing tokenId:

```ts
async function spawnFromNFT(tokenId: string): Promise<void> {
  const metadata = await inftAdapter.readMetadata(tokenId);
  const inheritedSkillRoots = Object.fromEntries(
    metadata.skills.map(s => [s.id, s.rootHash])
    // agent-runtime downloads full skill from 0G Storage on boot — same as dead-agent inheritance
  );
  spawnAgent(
    metadata.agentId,
    inheritedSkillRoots,
    [],
    [...metadata.ancestorTokenIds, tokenId],
    tokenId,   // ← existingTokenId, skip mint
  );
}
```

#### SKILL_ACCEPTED → updateMetadata

In the `rl.on("line")` handler, after `skills.set(...)`:

```ts
if (event.kind === "SKILL_ACCEPTED" && entry.tokenId) {
  const updatedMetadata = await buildMetadata(entry); // reads skills map + entry
  inftAdapter.updateMetadata(entry.tokenId, updatedMetadata).catch(console.error);
}
```

`buildMetadata` constructs `AgentNFTMetadata` from current state. Skills are stored as `{ id, name, rootHash }` only — full skill objects stay on 0G Storage and are never duplicated into the metadata blob. Non-blocking, fire-and-forget with error logging.

#### Death → dormant

In `proc.on("exit")` (after the `wasAlive` guard, before replacement spawn):

```ts
if (entry.tokenId && !entry.sold) {
  const dormantMeta = await buildMetadata(entry);
  dormantMeta.status = "dormant";
  dormantMeta.deathTick = tick;
  dormantMeta.deathReason = code === 0 ? "natural" : `exit ${code}`;
  inftAdapter.setDormant(entry.tokenId, dormantMeta).catch(console.error);
}
```

For hunger and crisis deadline kills (where we broadcast AGENT_DIED before proc.on fires), `entry.alive` is already false. The dormant update still runs in proc.on because `entry.sold` is false. Fine — status:"dormant" is a metadata update, not time-critical.

### 5.4 Marketplace HTTP routes (operator only)

Engine exposes only two operator-facing endpoints (alongside `/crisis`). Buyers transact directly with the on-chain contract — no engine-to-engine HTTP.

```
POST /marketplace/list    → { tokenId, salePriceWei }           # operator: list an agent for sale
POST /marketplace/delist  → { tokenId }                         # operator: remove listing
POST /marketplace/import  → { tokenId }                         # operator: buy + spawn from another world
```

**List constraints** (enforced server-side):

- Agent must be alive and `status === "idle"`.
- Sets `entry.listed = true`.
- Auto-delist on `REASONING_STARTED`: if `event.kind === "REASONING_STARTED" && entry.listed`, call `marketplaceAdapter.delist(entry.tokenId)` and set `entry.listed = false`.

### 5.5 Contract event listeners (replaces engine-to-engine HTTP)

Each engine subscribes to contract events at boot. Neither engine calls the other directly — the contract is the coordinator.

```ts
// Seller engine: react to a buyer paying on-chain
marketplaceContract.on("Sold", (tokenId, buyer) => {
  const entry = [...agents.values()].find(a => a.tokenId === tokenId.toString());
  if (!entry) return;                   // not our token
  entry.sold = true;
  entry.alive = false;
  entry.listed = false;
  entry.proc.stdin!.write(JSON.stringify({ kind: "DIE", reason: "sold" }) + "\n");
  broadcast({ kind: "AGENT_SOLD", tick, actorId: entry.id, payload: { tokenId: tokenId.toString() } });
  inftAdapter.transfer(tokenId.toString(), buyer).catch(console.error);
});

marketplaceContract.on("Leased", (tokenId, lessee, until) => {
  const entry = [...agents.values()].find(a => a.tokenId === tokenId.toString());
  if (!entry) return;
  broadcast({ kind: "AGENT_LEASED", tick, actorId: entry.id, payload: { tokenId: tokenId.toString(), leasedTo: lessee, until: Number(until) } });
  inftAdapter.authorizeUsage(tokenId.toString(), lessee, Number(until) - Date.now() / 1000).catch(console.error);
});

// Buyer engine: react to a token arriving in this wallet
inftContract.on("Transfer", (_from, to, tokenId) => {
  if (to.toLowerCase() !== engineWalletAddress.toLowerCase()) return;
  spawnFromNFT(tokenId.toString()).catch(console.error);
});
```

**proc.on("exit") for sold agents** — `entry.sold = true` before proc exits, so:
- `wasAlive` guard: false (already cleared) → no duplicate AGENT_DIED broadcast
- `entry.sold` check: true → no dormant update, no replacement spawn

The `inftAdapter.transfer` call happens in the `Sold` listener before the proc fully exits — that ordering is fine since the oracle call is async and the proc exit is fast.

---

## 6. All death cases

| Scenario | entry.alive | entry.sold | AGENT_DIED | iNFT update | Replacement spawn |
|---|---|---|---|---|---|
| Hunger threshold | set false immediately (doTick) | false | broadcast immediately in doTick | setDormant in proc.on | yes, new tokenId with ancestorTokenIds |
| Crisis deadline (didn't resolve) | set false immediately (doTick) | false | broadcast immediately in doTick | setDormant in proc.on | yes |
| Crisis resolved (survived) | true | false | n/a | updateMetadata with new skills | n/a |
| Sold (idle) | set false on sale | true | broadcast with reason "sold" | transfer() (not dormant) | no |
| Natural exit (agent called exit) | set false in proc.on wasAlive guard | false | broadcast in proc.on | setDormant | yes |
| Mid-evolve die signal (hunger/crisis) | set false immediately | false | broadcast immediately | setDormant in proc.on (after proc exits) | yes |
| Lease expiry | future enhancement | — | — | — | — |

---

## 7. New shared events

**These require dev sync before adding to `shared/` — coordinate before touching the Event union.**

```ts
{ kind: "AGENT_MINTED";   tick; actorId; payload: { tokenId: string } }
{ kind: "AGENT_LISTED";   tick; actorId; payload: { tokenId: string; salePriceWei: string } }
{ kind: "AGENT_DELISTED"; tick; actorId; payload: { tokenId: string; reason: "sold"|"reasoning"|"manual" } }
{ kind: "AGENT_SOLD";     tick; actorId; payload: { tokenId: string; buyerWorldId: string } }
{ kind: "AGENT_IMPORTED"; tick; actorId; payload: { tokenId: string; fromWorldId: string; skills: string[] } }
// Future: { kind: "AGENT_LEASED"; tick; actorId; payload: { tokenId: string; leasedTo: string; until: number } }
```

Add to the `EventKind` union in `packages/web/src/store.ts` and the Event type in `packages/shared/src/index.ts`.

---

## 8. MarketplacePanel UI

New file: `packages/web/src/MarketplacePanel.tsx`

The panel is a collapsible drawer, similar to EventPanel, floated on the left side of the screen (EventPanel is on the right).

The panel is read-only for buyers — operators list agents via engine HTTP, not via the UI.

### Layout

```
[MARKETPLACE]                               [×]
────────────────────────────────────────────
savannah  •  alice   3 skills  0.5 ZG
  [IMPORT]
────────────────────────────────────────────
savannah-ghost  •  dave   2 skills  1.2 ZG
  [IMPORT]
────────────────────────────────────────────
```

Read-only display. No wallet, no listing UI. Listings from all worlds grouped by `worldId`.

### State

Reads from:
- `GET /marketplace/listings` on the local engine (which calls `marketplaceAdapter.getActiveListings()`) — polling every 5s

Actions:
- IMPORT: `POST /engine/import { tokenId }` on the **buyer's own engine** → engine pays the contract `buy(tokenId)` with its `ZG_PRIVATE_KEY` wallet → contract emits `Sold` → seller engine listener kills agent + calls `inftAdapter.transfer` → buyer engine `Transfer` listener calls `spawnFromNFT`

No wallet in the browser. All payment and transfer is engine-wallet-signed on the backend.

### App.tsx integration

Add import + left-side panel mount. Mirror the EventPanel toggle tab pattern on the left side:

```tsx
{/* Marketplace panel + tab — floats left, below tick bar */}
<div style={{ position: "absolute", top: 60, left: 0, bottom: 12, zIndex: 40, display: "flex", flexDirection: "row" }}>
  <button onClick={() => setShowMarketplace(p => !p)} /* tab */ >
    <span style={{ writingMode: "vertical-rl" }}>MARKET</span>
  </button>
  {showMarketplace && <MarketplacePanel />}
</div>
```

---

## 9. Ghost-world seeding (demo setup)

Before the live demo, pre-populate a second world's listings so the "import from other worlds" section isn't empty:

1. Run a headless engine with `WORLD_ID=savannah-ghost` for ~50 ticks (triggers at least one lion, one skill learned).
2. Script the ghost engine to list its surviving agents (`POST /marketplace/list`).
3. Point the demo engine's marketplace panel at the same contract addresses — listings from ghost world appear immediately.

This avoids needing two live engines during the 90-second demo window.

---

## 10. Deployment steps

1. Deploy iNFT contract on Galileo:
   ```sh
   npx hardhat run scripts/deploy-inft.ts --network galileo
   # → INFT_CONTRACT_ADDRESS
   ```

2. Deploy marketplace contract:
   ```sh
   npx hardhat run scripts/deploy-marketplace.ts --network galileo
   # → MARKETPLACE_CONTRACT_ADDRESS
   ```

3. Add to `.env`:
   ```
   INFT_CONTRACT_ADDRESS=0x...
   MARKETPLACE_CONTRACT_ADDRESS=0x...
   ORACLE_URL=https://oracle.0g.ai/...
   WORLD_ID=savannah
   ```

4. `packages/inft/` — implement adapters (see §4).

5. Engine changes (see §5) — mint on spawn, update on skill, dormant on death, HTTP routes.

6. UI — MarketplacePanel.tsx + App.tsx integration (see §8).

7. Ghost-world seed run (see §9).

---

## 11. Implementation order

1. `packages/inft/src/types.ts` — define AgentNFTMetadata
2. Deploy contracts → get addresses, add env vars
3. `inft-adapter.ts` — mint + updateMetadata + setDormant (test against Galileo)
4. `marketplace-adapter.ts` — list + delist + getListings (test against Galileo)
5. Engine lifecycle hooks — spawn→mint, SKILL_ACCEPTED→update, proc.on→dormant
6. Engine HTTP marketplace routes
7. Shared event additions (after dev sync)
8. `MarketplacePanel.tsx`
9. Ghost-world seed run
10. End-to-end demo test: spawn → learn skill → list → buy from ghost → import → survive crisis
