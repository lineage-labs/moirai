import type { ComputeReceipt, DomainEvent, Skill } from "@moirai/shared";

export type InferOptions = {
  verifiable: boolean;
  maxTokens?: number;
  temperature?: number;
};

export type InferResult = {
  text: string;
  receipt: ComputeReceipt;
};

export interface IComputeAdapter {
  infer(prompt: string, opts: InferOptions): Promise<InferResult>;
}

export type PersistedEvent = DomainEvent & { eventId: string };

export interface IStorageAdapter {
  putSkill(skill: Skill): Promise<{ rootHash: string }>;
  getSkill(rootHash: string): Promise<Skill>;
  listSkills(filter?: { minScore?: number }): Promise<Skill[]>;
  appendEvent(event: DomainEvent): Promise<{ eventId: string }>;
}

export type PeerMessageHandler = (msg: { from: string; payload: unknown }) => void | Promise<void>;

export interface INetworkAdapter {
  myPeerId(): string;
  whisper(peerId: string, payload: unknown): Promise<void>;
  broadcast(payload: unknown): Promise<void>;
  subscribe(handler: PeerMessageHandler): () => void;
  topology(): Promise<{ peerId: string }[]>;
}
