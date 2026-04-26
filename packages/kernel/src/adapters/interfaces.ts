import type { Skill, Receipt, DomainEvent } from "@moirai/shared";

export type InferOpts = {
  verifiable: boolean;
  maxTokens?: number;
  temperature?: number;
  outputSchema?: unknown;
};

export type InferResult = {
  text: string;
  receipt: Receipt;
};

export interface IComputeAdapter {
  infer(prompt: string, opts: InferOpts): Promise<InferResult>;
  verifyReceipt(receipt: Receipt): Promise<boolean>;
}

export interface IStorageAdapter {
  putSkill(skill: Skill): Promise<{ id: string }>;
  getSkill(id: string): Promise<Skill | null>;
  listSkills(): Promise<Skill[]>;
  appendEvent(event: DomainEvent): Promise<void>;
}

export type AxlInbound = {
  from: string;
  payload: unknown;
};

export interface INetworkAdapter {
  whisper(peerId: string, payload: unknown): Promise<void>;
  broadcast(payload: unknown): Promise<void>;
  subscribe(handler: (msg: AxlInbound) => void | Promise<void>): () => void;
  topology(): Promise<string[]>;
  myPeerId(): string;
}
