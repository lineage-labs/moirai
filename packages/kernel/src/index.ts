// @moirai/kernel — public contract.
//
// This package contains ONLY types and interfaces. There is no behaviour here.
// The kernel team implements `createKernel()`, `evolve()`, and the three real
// adapters (0g-compute, 0g-storage, axl) in their own package against this contract.
//
// Engine and agent-runtime import types from this package and obtain a concrete
// `Kernel` at runtime from whatever module the kernel team ships (or, during
// development, from a local fixture inside agent-runtime).

export type {
  IComputeAdapter,
  IStorageAdapter,
  INetworkAdapter,
  InferOptions,
  InferResult,
  PeerMessageHandler,
} from "./interfaces.js";

export type {
  Kernel,
  KernelConfig,
  CreateKernel,
  EvolveInput,
  EvolveResult,
  EvolveAcceptance,
  EvolveRejection,
  EmitEvent,
  Substrate,
} from "./kernel.js";

export { EvolveError } from "./kernel.js";

// Compatibility export path used by kernel-impl.
export type { InferOpts, AxlInbound } from "./adapters/interfaces.js";
