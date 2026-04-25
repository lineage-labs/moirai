import type { Skill, CandidateSkill } from "./skill.js";
import type { Crisis } from "./crisis.js";
import type { AgentId } from "./agent.js";

export type EventBase = {
  tick: number;
  actorId: AgentId | "engine";
  receiptHash?: string;
};

export type WorldTickEvent = EventBase & { kind: "WORLD_TICK" };
export type AgentSpawnedEvent = EventBase & { kind: "AGENT_SPAWNED"; payload: { personalityId: string } };
export type AgentDiedEvent = EventBase & { kind: "AGENT_DIED"; payload: { reason: string } };
export type CrisisStartedEvent = EventBase & { kind: "CRISIS_STARTED"; payload: Crisis };
export type CrisisResolvedEvent = EventBase & { kind: "CRISIS_RESOLVED"; payload: { crisisId: string } };
export type ReasoningStartedEvent = EventBase & { kind: "REASONING_STARTED"; payload: { crisisId: string } };
export type SkillProposedEvent = EventBase & { kind: "SKILL_PROPOSED"; payload: { candidate: CandidateSkill } };
export type SelfEvalStartedEvent = EventBase & { kind: "SELF_EVAL_STARTED"; payload: { candidateName: string } };
export type SelfEvalResultEvent = EventBase & { kind: "SELF_EVAL_RESULT"; payload: { score: number; failureModes: string[] } };
export type SkillAcceptedEvent = EventBase & { kind: "SKILL_ACCEPTED"; payload: { skill: Skill } };
export type SkillRejectedEvent = EventBase & { kind: "SKILL_REJECTED"; payload: { reason: string; score: number } };
export type AxlMessageEvent = EventBase & { kind: "AXL_MESSAGE"; payload: { from: AgentId; to: AgentId | "broadcast"; kind: string; body: unknown } };
export type SkillTaughtEvent = EventBase & { kind: "SKILL_TAUGHT"; payload: { to: AgentId; skillId: string } };
export type SkillLearnedEvent = EventBase & { kind: "SKILL_LEARNED"; payload: { from: AgentId; skillId: string } };
export type SkillInheritedEvent = EventBase & { kind: "SKILL_INHERITED"; payload: { skillId: string } };

export type Event =
  | WorldTickEvent
  | AgentSpawnedEvent
  | AgentDiedEvent
  | CrisisStartedEvent
  | CrisisResolvedEvent
  | ReasoningStartedEvent
  | SkillProposedEvent
  | SelfEvalStartedEvent
  | SelfEvalResultEvent
  | SkillAcceptedEvent
  | SkillRejectedEvent
  | AxlMessageEvent
  | SkillTaughtEvent
  | SkillLearnedEvent
  | SkillInheritedEvent;

export type EventKind = Event["kind"];
