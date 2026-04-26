import type { Kernel, KernelConfig, CreateKernel, EvolveInput, EvolveResult, EmitEvent } from "@moirai/kernel";
import { EvolveError } from "@moirai/kernel";
import { evolve } from "./evolve.js";

export const createKernel: CreateKernel = async (config: KernelConfig): Promise<Kernel> => {
  const { compute, storage, network, emit, personality, environment, agentId } = config;

  if (!personality || !environment || !agentId) {
    throw new EvolveError("kernel-impl requires personality, environment, and agentId in KernelConfig");
  }
  if (!compute || !storage || !network) {
    throw new EvolveError("kernel-impl requires compute, storage, and network adapters in KernelConfig");
  }

  return {
    compute,
    storage,
    net: network,
    evolve(input: EvolveInput): Promise<EvolveResult> {
      return evolve(
        { compute, storage, emit: emit as EmitEvent, personality, environment, agentId },
        input,
      );
    },
  };
};

export { ZeroGComputeAdapter } from "./adapters/0g-compute.js";
export type { ZeroGComputeConfig } from "./adapters/0g-compute.js";
export { ZeroGStorageAdapter } from "./adapters/0g-storage.js";
export type { ZeroGStorageConfig } from "./adapters/0g-storage.js";
export { AxlAdapter } from "./adapters/axl.js";
export type { AxlConfig } from "./adapters/axl.js";
