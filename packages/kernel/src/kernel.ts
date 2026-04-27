import type {
  Crisis,
  DomainEvent,
  Environment,
  Personality,
  Skill,
} from "@moirai/shared";
import type { IComputeAdapter, INetworkAdapter, IStorageAdapter } from "./interfaces.js";

/** Sink the kernel uses to surface domain events to the host (engine via agent-runtime). */
export type EmitEvent = (event: Omit<DomainEvent, "tick" | "actorId">) => void;

/** Input the agent-runtime hands to `kernel.evolve()` when a crisis appears or a new skill is needed. */
export type EvolveInput = {
  tick: number;
  situation: string;       // e.g. "A lion is attacking" or "I need food but have no foraging skill" or "improve my foraging technique"
  crisis?: Crisis;         // present when triggered by a crisis
  seedSkill?: Skill;       // present when improving an existing skill
  inventory: string[];
  knownSkills: Skill[];
};

export type EvolveAcceptance = {
  status: "accepted";
  skill: Skill;
};

export type EvolveRejection = {
  status: "rejected";
  score: number;
  failureModes: string[];
};

export type EvolveResult = EvolveAcceptance | EvolveRejection;

/** Substrate API surface — the three transport-level adapter handles, namespaced. */
export type Substrate = {
  compute: IComputeAdapter;
  storage: IStorageAdapter;
  net: INetworkAdapter;
};

export class EvolveError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EvolveError";
  }
}

/** What the kernel team's `createKernel()` accepts at construction time. */
export type KernelConfig = {
  agentId?: string;
  personality?: Personality;
  environment?: Environment;
  compute?: IComputeAdapter;
  storage?: IStorageAdapter;
  network?: INetworkAdapter;
  /** The kernel calls this to surface domain events emitted during evolve(). */
  emit: EmitEvent | ((event: unknown) => void);
};

/**
 * The Kernel handle held by every agent-runtime process.
 *
 * Two API layers:
 *   1. Substrate (transport): `kernel.compute.infer`, `kernel.storage.*`, `kernel.net.*`.
 *   2. Self-evolution (hero): `kernel.evolve(input)`.
 *
 * Implementation contract for the kernel team:
 *   - `evolve()` MUST emit, in order:
 *       REASONING_STARTED → SKILL_PROPOSED → SELF_EVAL_STARTED → SELF_EVAL_RESULT
 *       → (SKILL_ACCEPTED | SKILL_REJECTED)
 *   - Accepted skills MUST be persisted via `storage.putSkill()` BEFORE the promise resolves.
 *   - Both compute calls SHOULD be `verifiable: true` in production.
 *   - Acceptance threshold is `0.6` adjusted by `personality.risk` per spec §9.
 */
export type Kernel = {
  readonly agentId?: string;
  readonly substrate?: Substrate;
  readonly compute: IComputeAdapter;
  readonly storage: IStorageAdapter;
  readonly net: INetworkAdapter;
  evolve(input: EvolveInput): Promise<EvolveResult>;
  shutdown?(): Promise<void>;
};

/**
 * Type signature the kernel team must export as `createKernel`.
 * Consumers do `import { createKernel } from "<kernel-team's-package>"` and use it like this signature.
 */
export type CreateKernel = (config: KernelConfig) => Promise<Kernel>;
