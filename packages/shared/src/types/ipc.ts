import type { Crisis } from "./crisis.js";
import type { DomainEvent } from "./event.js";
import type { AgentInWorld } from "./world.js";

export type EngineToAgentMessage =
  | { kind: "INIT"; agentId: string; personalityPath: string; environmentPath: string; peerIds: string[]; tick: number }
  | { kind: "TICK"; tick: number; me: AgentInWorld; nearby: AgentInWorld[] }
  | { kind: "CRISIS"; tick: number; crisis: Crisis }
  | { kind: "PEER_MESSAGE"; from: string; payload: unknown }
  | { kind: "SHUTDOWN" };

export type AgentToEngineMessage =
  | { kind: "READY"; agentId: string }
  | { kind: "EVENT"; event: DomainEvent }
  | { kind: "PEER_SEND"; to: string; payload: unknown }
  | { kind: "PEER_BROADCAST"; payload: unknown }
  | { kind: "ACTION"; action: AgentAction };

export type AgentAction =
  | { kind: "MOVE"; dx: number; dy: number }
  | { kind: "APPLY_SKILL"; skillId: string; crisisId: string }
  | { kind: "IDLE" }
  | { kind: "FORAGE" }
  | { kind: "FARM" }
  | { kind: "REST" }
  | { kind: "SOCIALIZE"; targetId: string }
  | { kind: "EXPERIMENT" };
