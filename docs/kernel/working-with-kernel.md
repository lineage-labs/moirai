# Working With Kernel

This guide explains how to work on the kernel in this repo without breaking the contract between `@moirai/kernel` and `@moirai/kernel-impl`.

## Package Roles

- `@moirai/kernel` is the contract package (types and interfaces only).
- `@moirai/kernel-impl` is the real implementation package (adapters + `evolve()` + `createKernel` wiring).

Keep these boundaries strict:

- Put shared kernel types/interfaces in `packages/kernel/src`.
- Put runtime logic in `packages/kernel-impl/src`.
- Do not add implementation code to `@moirai/kernel`.

## Core Contract Invariants

When changing kernel behavior, preserve these invariants:

- `Kernel` exposes `compute`, `storage`, `net`, and `evolve(input)`.
- `evolve()` hero path uses verifiable compute for reasoning and self-eval.
- Skill acceptance threshold is `0.6 - (personality.risk - 0.5) * 0.4`.
- Accepted skills must include both provenance receipts:
  - `reasonReceipt`
  - `selfEvalReceipt`
- Event order in evolve flow must remain:
  - `REASONING_STARTED`
  - `SKILL_PROPOSED`
  - `SELF_EVAL_STARTED`
  - `SELF_EVAL_RESULT`
  - `SKILL_ACCEPTED` or `SKILL_REJECTED`

## Adapter Boundaries

All runtime integrations stay behind interfaces:

- `IComputeAdapter`
- `IStorageAdapter`
- `INetworkAdapter`

Implementation files:

- `packages/kernel-impl/src/adapters/0g-compute.ts`
- `packages/kernel-impl/src/adapters/0g-storage.ts`
- `packages/kernel-impl/src/adapters/axl.ts`

Kernel logic must consume interfaces, not concrete adapter classes.

## Local Development Workflow

From repo root:

```bash
pnpm -C packages/kernel typecheck
pnpm -C packages/kernel-impl typecheck
pnpm -C packages/kernel-impl test
```

Use tests for runtime checks. Current tests for evolve behavior live in:

- `packages/kernel-impl/src/evolve.test.ts`

## Runtime Smoke Testing Notes

Do not run Node directly against `src/*.ts` ESM entrypoints in `kernel-impl` for quick smoke checks. Source files use `.js` import specifiers intended for TypeScript/Vitest workflows and transpiled output.

Preferred smoke check path:

1. Validate types:

```bash
pnpm -C packages/kernel-impl typecheck
```

2. Run behavior tests:

```bash
pnpm -C packages/kernel-impl test
```

If you need CLI runtime validation, add or run a Vitest smoke test instead of importing `src/index.ts` with raw Node.

## Change Checklist

Before finishing kernel work:

- Typecheck passes for `kernel` and `kernel-impl`.
- `kernel-impl` tests pass.
- Event order in evolve flow is unchanged unless intentionally coordinated.
- No contract drift between `@moirai/kernel` and `@moirai/kernel-impl`.
- No accidental edits to `@moirai/shared` unless explicitly coordinated.

## Common Pitfalls

- Adding TS project references that force `composite` settings in sibling packages without coordination.
- Testing ESM TypeScript source with raw Node import paths.
- Importing runtime values from contract packages in ways that depend on unbuilt source paths.
- Introducing non-verifiable fallback behavior in hero-path reasoning/self-eval.
