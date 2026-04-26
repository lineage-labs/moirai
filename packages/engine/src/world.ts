import type { AgentInWorld, AgentNeeds, Crisis, WorldState } from "@moirai/shared";

const FIELD_W = 100;
const FIELD_H = 60;
const INITIAL_FOOD_POOL = 200;
const FORAGE_YIELD = 5;
const FARM_YIELD = 2;
const FOOD_POOL_REGEN = 1;

const INITIAL_NEEDS: AgentNeeds = { hunger: 20, energy: 80, curiosity: 30 };

export function createWorld(): WorldState {
  return { tick: 0, agents: {}, activeCrises: [], foodPool: INITIAL_FOOD_POOL };
}

export function spawnAgent(world: WorldState, agentId: string, personalityId: string): AgentInWorld {
  const agent: AgentInWorld = {
    id: agentId,
    personalityId,
    position: randomPosition(),
    alive: true,
    needs: { ...INITIAL_NEEDS },
    food: 50,
    inventory: ["rocks", "sticks"],
  };
  world.agents[agentId] = agent;
  return agent;
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

export function resolveCrisis(world: WorldState, crisisId: string): Crisis | undefined {
  const idx = world.activeCrises.findIndex((c) => c.id === crisisId);
  if (idx === -1) return undefined;
  return world.activeCrises.splice(idx, 1)[0];
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
  a.needs.curiosity = Math.min(100, a.needs.curiosity + 1);
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
