# Working With Kernel

This is the teammate handoff doc for the kernel surface, adapter testing, and current status.

## Package Boundaries

- `@moirai/kernel` is the contract package (interfaces + kernel types/errors only).
- `@moirai/kernel-impl` is the implementation package (real adapters + `evolve()` + `createKernel` wiring).
- Keep implementation code out of `@moirai/kernel`; consume adapters only through interfaces.

## Exposed API (What Your Teammate Can Import)

### From `@moirai/kernel`

`packages/kernel/src/index.ts` re-exports:

- `IComputeAdapter`, `IStorageAdapter`, `INetworkAdapter`, `InferOpts`, `InferResult`, `AxlInbound`
- `Kernel`, `KernelConfig`, `CreateKernel`
- `EvolveInput`, `EvolveResult`, `EvolveAcceptance`, `EvolveRejection`
- `EvolveError`

Interface methods:

- `IComputeAdapter`
  - `infer(prompt, opts)`
  - `verifyReceipt(receipt)`
- `IStorageAdapter`
  - `putSkill(skill)`
  - `getSkill(id)`
  - `listSkills()`
  - `appendEvent(event)`
- `INetworkAdapter`
  - `whisper(peerId, payload)`
  - `broadcast(payload)`
  - `subscribe(handler)`
  - `topology()`
  - `myPeerId()`

Kernel shape:

- `compute`, `storage`, `net`
- `evolve(input)`

### From `@moirai/kernel-impl`

`packages/kernel-impl/src/index.ts` exports:

- `createKernel(config)`
- `ZeroGComputeAdapter`, `ZeroGComputeConfig`
- `ZeroGStorageAdapter`, `ZeroGStorageConfig`
- `AxlAdapter`, `AxlConfig`

Notable non-interface helper methods in concrete adapters:

- `ZeroGComputeAdapter.ensureComputeLedgerAndInferenceFunds(...)`
- `ZeroGStorageAdapter.seedSkillRoot(...)`
- `ZeroGStorageAdapter.getSkillRoot(...)`
- `ZeroGStorageAdapter.getAllSkillRoots()`
- `ZeroGStorageAdapter.getEventBuffer()`
- `ZeroGStorageAdapter.flushEvents()`

## How to Test

Run all commands from repo root.

### 1) Kernel Logic (`evolve`) Tests

```bash
pnpm -C packages/kernel-impl exec vitest run src/evolve.test.ts
```

### 2) AXL Adapter Integration Tests (Real 3-node mesh)

```bash
pnpm axl:mesh:keys
pnpm axl:mesh:up
bash scripts/axl-mesh-check.sh
AXL_URL_1=http://127.0.0.1:19002 \
AXL_URL_2=http://127.0.0.1:19012 \
AXL_URL_3=http://127.0.0.1:19022 \
  pnpm -C packages/kernel-impl exec vitest run src/adapters/axl.test.ts
pnpm axl:mesh:down
```

Notes:

- Adapter keys must match daemon PEM keys (otherwise `X-From-Peer-Id ... does not match envelope.from ...`).
- For deep AXL debugging, set `AXL_DEBUG=1`.

### 3) 0G Adapter + Real-Network Smoke (`spike`)

```bash
pnpm -C packages/kernel-impl spike
```

This spike checks:

- 0G Compute ledger/account readiness (`ensureComputeLedgerAndInferenceFunds`)
- verifiable inference (`infer(..., { verifiable: true })`)
- receipt attestation check (`verifyReceipt`)
- 0G Storage roundtrip (`putSkill` + `getSkill`)
- optional AXL whisper/broadcast roundtrip if AXL URLs are set

To run only 0G paths (skip AXL section):

```bash
AXL_URL= AXL_URL_1= AXL_URL_2= AXL_URL_3= pnpm -C packages/kernel-impl spike
```

## Required Env Vars

Minimum for 0G:

- `ZG_RPC_URL`
- `ZG_PRIVATE_KEY`
- `ZG_INDEXER_URL`

AXL mesh defaults used by tests:

- `AXL_URL_1=http://127.0.0.1:19002`
- `AXL_URL_2=http://127.0.0.1:19012`
- `AXL_URL_3=http://127.0.0.1:19022`

Optional AXL key overrides:

- `AXL_KEY_PATH_1`
- `AXL_KEY_PATH_2`
- `AXL_KEY_PATH_3`

## Current Status (As Of This Update)

- `src/evolve.test.ts`: passing
- `src/adapters/axl.test.ts`: passing (12/12)
- AXL spike crash due to key mismatch has been fixed by loading daemon PEM keys in `spike.ts`
- 0G Compute path is working in spike
- 0G Storage `putSkill` can currently fail with `503` when testnet indexer is unavailable (`ZG_INDEXER_URL` outage); this is external infra availability, not a kernel contract failure

## Practical Guardrails

- Keep event contract/order in `evolve()` intact unless intentionally coordinated.
- Keep all runtime integrations behind `IComputeAdapter` / `IStorageAdapter` / `INetworkAdapter`.
- Do not test kernel TypeScript source with raw Node imports; use Vitest or built output paths.
