import type {
  Skill,
  Event,
  Personality,
  Environment,
  Crisis,
  AgentContext,
} from "@moirai/shared";
import type {
  IComputeAdapter,
  IStorageAdapter,
  INetworkAdapter,
} from "./adapters/interfaces.js";

export type EvolveInput = {
  personality: Personality;
  environment: Environment;
  crisis: Crisis;
  context: AgentContext;
  knownSkills: Skill[];
};

export type EvolveAcceptance = { status: "accepted"; skill: Skill };
export type EvolveRejection = { status: "rejected"; reason: string; score: number };
export type EvolveResult = EvolveAcceptance | EvolveRejection;

export class EvolveError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EvolveError";
  }
}

export interface Kernel {
  readonly compute: IComputeAdapter;
  readonly storage: IStorageAdapter;
  readonly net: INetworkAdapter;
  evolve(input: EvolveInput): Promise<EvolveResult>;
}

export type KernelConfig = {
  compute: IComputeAdapter;
  storage: IStorageAdapter;
  network: INetworkAdapter;
  emit: (event: Event) => void;
};

export type CreateKernel = (config: KernelConfig) => Promise<Kernel>;
