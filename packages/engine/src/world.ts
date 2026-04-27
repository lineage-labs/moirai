import type { AgentInWorld, AgentNeeds, Crisis, WorldState } from "@moirai/shared";

// Needs crises disabled — they fire too frequently and exhaust the 0G rate limit.
// Only scheduled crises (LION etc.) use 0G Compute.
const HUNGER_CRISIS_THRESHOLD = 101;  // unreachable (max is 100)
const HUNGER_CRISIS_CLEAR = 55;
const ENERGY_CRISIS_THRESHOLD = -1;   // unreachable (min is 0)
const ENERGY_CRISIS_CLEAR = 30;
const NEEDS_CRISIS_DEADLINE = 200;

const FIELD_W = 100;
const FIELD_H = 60;
const INITIAL_FOOD_POOL = 200;
const FORAGE_YIELD = 5;
const FARM_YIELD = 2;
const FOOD_POOL_REGEN = 1;

export function createWorld(): WorldState {
  return { tick: 0, agents: {}, activeCrises: [], foodPool: INITIAL_FOOD_POOL };
}

export function spawnAgent(world: WorldState, agentId: string, personalityId: string): AgentInWorld {
  // Spread starting needs so agents hit thresholds at different times
  const hunger = 5 + Math.random() * 35;   // 5–40, well below HUNGER_CRISIS_THRESHOLD=75
  const energy = 55 + Math.random() * 35;  // 55–90, well above ENERGY_CRISIS_THRESHOLD=15
  const agent: AgentInWorld = {
    id: agentId,
    personalityId,
    position: randomPosition(),
    alive: true,
    needs: { hunger, energy, curiosity: 20 + Math.random() * 40 },
    food: 30 + Math.floor(Math.random() * 40),
    inventory: ["rocks", "sticks"],
  };
  world.agents[agentId] = agent;
  return agent;
}

/** Remove agentId from every active crisis. Returns crises that now have zero affected agents. */
export function cleanupAgentCrises(world: WorldState, agentId: string): Crisis[] {
  const emptied: Crisis[] = [];
  world.activeCrises = world.activeCrises.filter((c) => {
    if (!c.affectedAgents.includes(agentId)) return true;
    c.affectedAgents = c.affectedAgents.filter((id) => id !== agentId);
    if (c.affectedAgents.length === 0) {
      emptied.push(c);
      return false;
    }
    return true;
  });
  return emptied;
}

export function killAgent(world: WorldState, agentId: string): void {
  const a = world.agents[agentId];
  if (a) a.alive = false;
}

export function nearbyAgents(world: WorldState, agentId: string, radius = 30): AgentInWorld[] {
  const me = world.agents[agentId];
  if (!me) return [];
  return Object.values(world.agents).filter(
    (a) => a.id !== agentId && a.alive && distance(a.position, me.position) <= radius,
  );
}

export function moveAgent(world: WorldState, agentId: string, dx: number, dy: number): void {
  const a = world.agents[agentId];
  if (!a || !a.alive) return;
  a.position.x = clamp(a.position.x + dx, 0, FIELD_W);
  a.position.y = clamp(a.position.y + dy, 0, FIELD_H);
}

export function startCrisis(world: WorldState, crisis: Crisis): void {
  world.activeCrises.push(crisis);
}

/** Remove agentId from crisis. Returns the crisis only when it is fully resolved (no affected agents left). */
export function resolveCrisis(world: WorldState, crisisId: string, agentId: string): Crisis | undefined {
  const crisis = world.activeCrises.find((c) => c.id === crisisId);
  if (!crisis) return undefined;
  crisis.affectedAgents = crisis.affectedAgents.filter((id) => id !== agentId);
  if (crisis.affectedAgents.length === 0) {
    world.activeCrises = world.activeCrises.filter((c) => c.id !== crisisId);
    return crisis;
  }
  return undefined;
}

export function expireCrises(world: WorldState): Crisis[] {
  const expired: Crisis[] = [];
  world.activeCrises = world.activeCrises.filter((c) => {
    if (world.tick > c.startedAtTick + c.deadlineTicks) {
      expired.push(c);
      return false;
    }
    return true;
  });
  return expired;
}

export function forageFood(world: WorldState, agentId: string, multiplier = 1): number {
  const a = world.agents[agentId];
  if (!a?.alive) return 0;
  const yield_ = Math.min(world.foodPool, Math.round(FORAGE_YIELD * multiplier));
  world.foodPool -= yield_;
  a.food += yield_;
  return yield_;
}

export function farmFood(world: WorldState, agentId: string, multiplier = 1): number {
  const a = world.agents[agentId];
  if (!a?.alive) return 0;
  const yield_ = Math.round(FARM_YIELD * multiplier);
  a.food += yield_;
  world.foodPool += yield_;
  return yield_;
}

export function replenishFoodPool(world: WorldState): void {
  world.foodPool = Math.min(INITIAL_FOOD_POOL, world.foodPool + FOOD_POOL_REGEN);
}

export function decayAgentNeeds(world: WorldState, agentId: string): void {
  const a = world.agents[agentId];
  if (!a?.alive) return;
  if (a.food > 0) {
    a.food--;
    a.needs.hunger = Math.max(0, a.needs.hunger - 5);
  } else {
    a.needs.hunger = Math.min(100, a.needs.hunger + 3);
  }
  a.needs.energy = Math.max(0, a.needs.energy - 0.25);
  a.needs.curiosity = Math.min(100, a.needs.curiosity + 1);
}

export function checkNeedsThresholds(world: WorldState, agentId: string): {
  newCrises: Crisis[];
  resolvedCrisisIds: string[];
} {
  const a = world.agents[agentId];
  if (!a?.alive) return { newCrises: [], resolvedCrisisIds: [] };

  // Don't pile needs crises on top of an already-active non-needs crisis
  const hasBlockingCrisis = world.activeCrises.some(
    (c) => c.affectedAgents.includes(agentId) && c.type !== "HUNGER" && c.type !== "LOW_ENERGY",
  );
  if (hasBlockingCrisis) return { newCrises: [], resolvedCrisisIds: [] };

  const newCrises: Crisis[] = [];
  const resolvedCrisisIds: string[] = [];

  const activeHunger = world.activeCrises.find(
    (c) => c.type === "HUNGER" && c.affectedAgents.includes(agentId),
  );
  const activeEnergy = world.activeCrises.find(
    (c) => c.type === "LOW_ENERGY" && c.affectedAgents.includes(agentId),
  );

  if (a.needs.hunger >= HUNGER_CRISIS_THRESHOLD && !activeHunger) {
    const crisis: Crisis = {
      id: `hunger_${agentId}_${world.tick}`,
      type: "HUNGER",
      description: "Agent has exceeded critical hunger threshold — physiological crisis",
      startedAtTick: world.tick,
      deadlineTicks: NEEDS_CRISIS_DEADLINE,
      affectedAgents: [agentId],
    };
    world.activeCrises.push(crisis);
    newCrises.push(crisis);
  } else if (activeHunger && a.needs.hunger < HUNGER_CRISIS_CLEAR) {
    const idx = world.activeCrises.indexOf(activeHunger);
    if (idx !== -1) world.activeCrises.splice(idx, 1);
    resolvedCrisisIds.push(activeHunger.id);
  }

  if (a.needs.energy <= ENERGY_CRISIS_THRESHOLD && !activeEnergy) {
    const crisis: Crisis = {
      id: `energy_${agentId}_${world.tick}`,
      type: "LOW_ENERGY",
      description: "Agent has exceeded critical fatigue threshold — energy depletion crisis",
      startedAtTick: world.tick,
      deadlineTicks: NEEDS_CRISIS_DEADLINE,
      affectedAgents: [agentId],
    };
    world.activeCrises.push(crisis);
    newCrises.push(crisis);
  } else if (activeEnergy && a.needs.energy > ENERGY_CRISIS_CLEAR) {
    const idx = world.activeCrises.indexOf(activeEnergy);
    if (idx !== -1) world.activeCrises.splice(idx, 1);
    resolvedCrisisIds.push(activeEnergy.id);
  }

  return { newCrises, resolvedCrisisIds };
}

export function applyRestEffect(world: WorldState, agentId: string): void {
  const a = world.agents[agentId];
  if (!a?.alive) return;
  a.needs.energy = Math.min(100, a.needs.energy + 15);
  if (a.food > 0) a.needs.curiosity = Math.min(100, a.needs.curiosity + 5);
}


function randomPosition() {
  return { x: Math.random() * FIELD_W, y: Math.random() * FIELD_H };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
