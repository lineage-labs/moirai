import type { AgentNeeds } from "@moirai/shared";

export type NeedPriority = "hunger" | "energy" | "curiosity" | "none";

const HUNGER_CRITICAL = 70;
const ENERGY_LOW = 30;
const CURIOSITY_PEAK = 80;

export function decayNeeds(needs: AgentNeeds, foodStock: number): AgentNeeds {
  return {
    hunger: foodStock > 0
      ? Math.max(0, needs.hunger - 5)
      : Math.min(100, needs.hunger + 3),
    energy: needs.energy,
    curiosity: Math.min(100, needs.curiosity + 1),
  };
}

export function topNeed(needs: AgentNeeds): NeedPriority {
  if (needs.hunger >= HUNGER_CRITICAL) return "hunger";
  if (needs.energy <= ENERGY_LOW) return "energy";
  if (needs.curiosity >= CURIOSITY_PEAK) return "curiosity";
  return "none";
}
