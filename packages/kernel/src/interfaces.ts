import type { Receipt, Skill } from "@moirai/shared";

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

export interface IStorageAdapter {
  putSkill(skill: Skill): Promise<{ id: string }>;
  getSkill(id: string): Promise<Skill | null>;
  listSkills(): Promise<Skill[]>;
  putAgentInventory(agentId: string, skillIds: string[]): Promise<void>;
  getAgentInventory(agentId: string): Promise<string[]>;
}

export type PeerMessageHandler = (msg: { from: string; payload: unknown }) => void | Promise<void>;

export interface INetworkAdapter {
  myPeerId(): string;
  whisper(peerId: string, payload: unknown): Promise<void>;
  broadcast(payload: unknown): Promise<void>;
  subscribe(handler: PeerMessageHandler): () => void;
  topology(): Promise<string[]>;
}
