import type { ChildProcess } from "node:child_process";
import type { Skill } from "@moirai/shared";

export type AgentEntry = {
  id: string;
  personalityId?: string; // set when agentId differs from personalityId (e.g. imported NFT)
  proc: ChildProcess;
  alive: boolean;
  knownSkillIds: Set<string>;
  hunger: number;
  hungerConfig?: { rate: number; threshold: number };
  tokenId?: string;
  image?: string; // base64 data URI for UI display and embedded in tokenURI
  listed: boolean;
  sold: boolean;
};

export type SkillEntry = { skill: Skill; rootHash: string };
