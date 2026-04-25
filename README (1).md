# @moirai/kernel — contract

This package contains **types and interfaces only**. There is no implementation here. It exists so the engine and agent-runtime can be written against a stable contract while the kernel itself is built in parallel.

The kernel team owns the implementation: the three real adapters (`0g-compute`, `0g-storage`, `axl`), the substrate plumbing, and the `evolve()` self-evolution loop.

## What you must export from your implementation package

```ts
import type { CreateKernel } from "@moirai/kernel";

export const createKernel: CreateKernel = async (config) => {
  // wire adapters, return a Kernel that satisfies the contract
};
```

Engine and agent-runtime import the contract from `@moirai/kernel` and resolve `createKernel` from your package at runtime.

## What the kernel must do

### Substrate API (transport layer)

Direct passthrough to the three adapters, exposed as `kernel.compute`, `kernel.storage`, `kernel.net`.

- `kernel.compute.infer(prompt, opts)` — sealed inference (0G Compute) when `opts.verifiable === true`; cheap LLM otherwise. Returns `{ text, receipt }`. Receipt MUST carry a real hash from the TEE for verifiable calls.
- `kernel.compute.verifyReceipt(receipt)` — verify a TEE signature.
- `kernel.storage.putSkill / getSkill / listSkills / appendEvent` — 0G Storage.
- `kernel.net.whisper(peerId, payload)` — point-to-point AXL.
- `kernel.net.broadcast(payload)` — fan-out AXL.
- `kernel.net.subscribe(handler)` — register inbound message handler. Returns unsubscribe.
- `kernel.net.topology()` — list visible peers.
- `kernel.net.myPeerId()` — local peer ID.

### Self-evolution layer

`kernel.evolve(input)` — the hero call. Spec §9.

Required event sequence on the `config.emit` sink, in order:

```
REASONING_STARTED →
SKILL_PROPOSED →
SELF_EVAL_STARTED →
SELF_EVAL_RESULT →
(SKILL_ACCEPTED | SKILL_REJECTED)
```

On accept:
1. Build a `Skill` with both receipts attached to `provenance`.
2. Call `storage.putSkill(skill)` and wait for it.
3. Emit `SKILL_ACCEPTED`.
4. Resolve with `EvolveAcceptance`.

On reject (score below threshold):
1. Emit `SKILL_REJECTED` with the eval receipt.
2. Resolve with `EvolveRejection`. Do NOT persist the skill.

Acceptance threshold: `0.6 - (personality.risk - 0.5) * 0.4` (per spec §9).

### Adapters behind interfaces

The kernel uses `IComputeAdapter`, `IStorageAdapter`, `INetworkAdapter` (defined in `interfaces.ts`). Your real implementations:

- `0g-compute.ts` — `IComputeAdapter` over 0G Compute Network's serving broker SDK.
- `0g-storage.ts` — `IStorageAdapter` over 0G Storage's indexer SDK.
- `axl.ts` — `INetworkAdapter` over the local AXL node HTTP API (`localhost:9002` etc.).

For each adapter, write tests with mocks of the interface. The substrate and `evolve()` should be agnostic to which adapter is wired.

## What you MUST NOT do

- Do not depend on `@moirai/engine` or `@moirai/agent-runtime`. The kernel is below them.
- Do not extend the `Kernel` type without coordinating with engine + agent-runtime owners.
- Do not change the event order in `evolve()`. The smoke test asserts the sequence; the demo depends on it.
- Do not silently fall back to non-verifiable inference on the hero path. If 0G Compute is down during demo, surface the error — the engine will switch to replay mode.

## Error handling expectations (spec §12)

- 0G Compute timeout → fall back to non-verifiable inference; mark receipt `verifiable: false`. Caller decides what to do.
- 0G Storage write fail → 3 retries with exponential backoff before throwing.
- AXL partition → `whisper`/`broadcast` may resolve without delivery; subscribers get nothing until reconnect. Do not throw.

## Reference flow (lion crisis)

See `docs/superpowers/specs/2026-04-24-civilisation-emergence-design.md` §10 for the canonical end-to-end trace.
