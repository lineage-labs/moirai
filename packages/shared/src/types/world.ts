import type { Crisis } from "./crisis.js";

export type Position = { x: number; y: number };

export type AgentNeeds = {
  hunger: number;    // 0–100, death at 100
  energy: number;    // 0–100, actions cost energy; rest restores
  curiosity: number; // 0–100, peaks trigger EXPERIMENT
};

export type AgentInWorld = {
  id: string;
  personalityId: string;
  position: Position;
  alive: boolean;
  needs: AgentNeeds;
  food: number;      // personal food stock
  inventory: string[];
};

export type WorldState = {
  tick: number;
  agents: Record<string, AgentInWorld>;
  activeCrises: Crisis[];
  foodPool: number;  // shared foraging pool
};
