import type { Skill, CandidateSkill } from "./skill.js";
import type { Crisis } from "./crisis.js";
import type { AgentId } from "./agent.js";

export type EventBase = {
  tick: number;
  actorId: AgentId | "engine";
  receiptHash?: string;
};

export type WorldTickEvent = EventBase & { kind: "WORLD_TICK" };
export type AgentSpawnedEvent = EventBase & { kind: "AGENT_SPAWNED"; payload: { personalityId: string; name?: string; traits?: string[]; image?: string } };
export type AgentDiedEvent = EventBase & { kind: "AGENT_DIED"; payload: { reason: string } };
export type CrisisStartedEvent = EventBase & { kind: "CRISIS_STARTED"; payload: Crisis };
export type CrisisResolvedEvent = EventBase & { kind: "CRISIS_RESOLVED"; payload: { crisisId: string; survived?: string[]; died?: string[]; totalAlive?: number } };
export type AgentRescuedEvent = EventBase & { kind: "AGENT_RESCUED"; payload: { crisisId: string; crisisType: string; skillUsed?: string } };
export type CrisisOverEvent = EventBase & { kind: "CRISIS_OVER"; payload: { crisisId: string; survived: string[]; killed: string[] } };
export type ReasoningStartedEvent = EventBase & { kind: "REASONING_STARTED"; payload: { crisisId: string } };
export type SkillProposedEvent = EventBase & { kind: "SKILL_PROPOSED"; payload: { candidate: CandidateSkill } };
export type SelfEvalStartedEvent = EventBase & { kind: "SELF_EVAL_STARTED"; payload: { candidateName: string } };
export type SelfEvalResultEvent = EventBase & { kind: "SELF_EVAL_RESULT"; payload: { score: number; failureModes: string[] } };
export type SkillAcceptedEvent = EventBase & { kind: "SKILL_ACCEPTED"; payload: { skill: Skill; rootHash?: string; storageSequenceId?: number } };
export type SkillRejectedEvent = EventBase & { kind: "SKILL_REJECTED"; payload: { reason: string; score: number } };
export type AxlMessageEvent = EventBase & { kind: "AXL_MESSAGE"; payload: { from: AgentId; to: AgentId | "broadcast"; kind: string; body: unknown } };
export type SkillTaughtEvent = EventBase & { kind: "SKILL_TAUGHT"; payload: { to: AgentId; skillId: string } };
export type SkillLearnedEvent = EventBase & { kind: "SKILL_LEARNED"; payload: { from: AgentId; skillId: string } };
export type SkillInheritedEvent = EventBase & { kind: "SKILL_INHERITED"; payload: { skillId: string } };
export type SkillDeclinedEvent = EventBase & { kind: "SKILL_DECLINED"; payload: { from: AgentId; skillId: string; skillName: string; skillEffect: string; score: number; reason?: string } };
export type AgentHungerEvent = EventBase & { kind: "AGENT_HUNGER"; payload: { hunger: number; threshold: number } };
export type AgentMintedEvent = EventBase & { kind: "AGENT_MINTED"; payload: { tokenId: string; contractAddress?: string } };
export type AgentListedEvent = EventBase & { kind: "AGENT_LISTED"; payload: { tokenId: string; salePriceWei: string } };
export type AgentDelistedEvent = EventBase & { kind: "AGENT_DELISTED"; payload: { tokenId: string; reason: "sold" | "reasoning" | "manual" } };
export type AgentSoldEvent = EventBase & { kind: "AGENT_SOLD"; payload: { tokenId: string } };
export type AgentImportedEvent = EventBase & { kind: "AGENT_IMPORTED"; payload: { tokenId: string; skills: string[]; contractAddress?: string } };

export type Event =
  | WorldTickEvent
  | AgentSpawnedEvent
  | AgentDiedEvent
  | AgentHungerEvent
  | CrisisStartedEvent
  | CrisisResolvedEvent
  | AgentRescuedEvent
  | CrisisOverEvent
  | ReasoningStartedEvent
  | SkillProposedEvent
  | SelfEvalStartedEvent
  | SelfEvalResultEvent
  | SkillAcceptedEvent
  | SkillRejectedEvent
  | SkillDeclinedEvent
  | AxlMessageEvent
  | SkillTaughtEvent
  | SkillLearnedEvent
  | SkillInheritedEvent
  | AgentMintedEvent
  | AgentListedEvent
  | AgentDelistedEvent
  | AgentSoldEvent
  | AgentImportedEvent;

export type EventKind = Event["kind"];
