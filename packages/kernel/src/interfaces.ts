import type { DomainEvent, Receipt, Skill } from "@moirai/shared";

export type InferOptions = {
  verifiable: boolean;
  maxTokens?: number;
  temperature?: number;
};

export type InferResult = {
  text: string;
  receipt: Receipt;
};

export interface IComputeAdapter {
  infer(prompt: string, opts: InferOptions): Promise<InferResult>;
}

export type PersistedEvent = DomainEvent & { eventId: string };

export interface IStorageAdapter {
  putSkill(skill: Skill): Promise<{ id: string }>;
  getSkill(id: string): Promise<Skill | null>;
  listSkills(filter?: { minScore?: number }): Promise<Skill[]>;
  appendEvent(event: DomainEvent): Promise<void>;
  putAgentInventory(agentId: string, skillIds: string[]): Promise<void>;
  getAgentInventory(agentId: string): Promise<string[]>;
  putAgentSocialGraph(agentId: string, memberIds: string[]): Promise<void>;
  getAgentSocialGraph(agentId: string): Promise<string[]>;
}

export type PeerMessageHandler = (msg: { from: string; payload: unknown }) => void | Promise<void>;

export interface INetworkAdapter {
  myPeerId(): string;
  whisper(peerId: string, payload: unknown): Promise<void>;
  broadcast(payload: unknown): Promise<void>;
  subscribe(handler: PeerMessageHandler): () => void;
  topology(): Promise<string[]>;
}
