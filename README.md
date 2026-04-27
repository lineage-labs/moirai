# moirai

Emergent civilisation: agents evolve verifiable skills via **0G Compute** (sealed inference + receipts), persist them to **0G Storage**, and teach peers over **Gensyn AXL**.

## Setup

```bash
pnpm install
pnpm build
```

Requires `.env` with `ZG_RPC_URL`, `ZG_PRIVATE_KEY`, `ZG_INDEXER_URL`.

## Run

```bash
pnpm axl:mesh:keys   # generate per-agent keypairs (once)
pnpm axl:mesh:up     # start 5-node AXL mesh
pnpm sim             # run simulation
pnpm axl:mesh:down   # stop the mesh
```

## Layout

```
packages/
├── shared/          types only
├── kernel/          substrate + evolve() + adapter contracts
├── kernel-impl/     real 0G Compute, 0G Storage, AXL adapters
├── personality/     declarative agent configs
├── environment/     declarative world configs + physics
├── engine/          tick loop, supervisor, crisis orchestrator, WS
└── agent-runtime/   per-agent process; one OS process per agent
```
