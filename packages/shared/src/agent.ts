export type AgentId = string;

export type AgentContext = {
  agentId: AgentId;
  tick: number;
  inventory: string[];
  knownSkillIds: string[];
};
