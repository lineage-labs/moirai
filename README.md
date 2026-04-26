# moirai

Emergent civilisation: agents evolve verifiable skills via **0G Compute** (sealed inference + receipts), persist them to **0G Storage**, and teach peers over **Gensyn AXL**.

## Quickstart

```bash
pnpm install
pnpm build         # typecheck all packages
pnpm dev           # start engine with 5 agents, dev-stub kernel
pnpm sim           # terminal-only village simulation (no UI)
pnpm smoke         # headless run, asserts demo event sequence
```

### Terminal simulation knobs

Run compact logs (default):

```bash
pnpm sim
```

Recommended hackathon demo run (clear narrative in terminal):

```bash
MOIRAI_MAX_TICKS=220 MOIRAI_TICK_MS=120 pnpm sim
```

Run full event stream:

```bash
pnpm sim -- --verbose
```

Common env overrides:

```bash
MOIRAI_MAX_TICKS=600 MOIRAI_TICK_MS=150 pnpm sim
```

## Layout

```
packages/
├── shared/          types only
├── kernel/          substrate + evolve() + adapter contracts (THIS IS A CONTRACT)
├── personality/     declarative agent configs
├── environment/     declarative world configs + physics
├── engine/          tick loop, supervisor, crisis orchestrator, WS
└── agent-runtime/   per-agent process; one OS process per agent
```

## Status

`engine`, `agent-runtime`, `personality`, `environment`, `shared` — implemented.

`kernel` — **contract only**. Real adapters (`0g-compute`, `0g-storage`, `axl`) are skeletons that throw. Kernel team fills these in. Dev-stub adapters under `kernel/src/dev-stubs/` let the engine + agent-runtime run end-to-end today via `createDevKernel()`.

See `packages/kernel/README.md` for the contract.
