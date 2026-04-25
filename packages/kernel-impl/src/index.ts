import type { Kernel, KernelConfig, CreateKernel, EvolveInput, EvolveResult } from "@moirai/kernel";
import { evolve } from "./evolve.js";

export const createKernel: CreateKernel = async (config: KernelConfig): Promise<Kernel> => {
  const { compute, storage, network, emit } = config;
  return {
    compute,
    storage,
    net: network,
    evolve(input: EvolveInput): Promise<EvolveResult> {
      return evolve({ compute, storage, emit }, input);
    },
  };
};

export { ZeroGComputeAdapter } from "./adapters/0g-compute.js";
export type { ZeroGComputeConfig } from "./adapters/0g-compute.js";
export { ZeroGStorageAdapter } from "./adapters/0g-storage.js";
export type { ZeroGStorageConfig } from "./adapters/0g-storage.js";
export { AxlAdapter } from "./adapters/axl.js";
export type { AxlConfig } from "./adapters/axl.js";
