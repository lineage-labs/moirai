import type { Crisis, Environment, WorldState } from "@moirai/shared";

export type CrisisOrchestrator = {
  /** Returns crises that just started this tick. */
  step(world: WorldState): Crisis[];
};

export function createCrisisOrchestrator(env: Environment): CrisisOrchestrator {
  let nextSerial = 1;
  const fired = new Set<number>();

  return {
    step(world) {
      const due: Crisis[] = [];
      for (let i = 0; i < env.crisisSchedule.length; i++) {
        if (fired.has(i)) continue;
        const entry = env.crisisSchedule[i]!;
        if (entry.tick !== world.tick) continue;
        fired.add(i);

        const targetIds = entry.targets ?? Object.values(world.agents).filter((a) => a.alive).slice(0, 2).map((a) => a.id);
        const aliveTargets = targetIds.filter((id) => world.agents[id]?.alive);
        if (aliveTargets.length === 0) continue;

        const crisis: Crisis = {
          id: `${entry.type.toLowerCase()}_${nextSerial++}`,
          type: entry.type,
          description: entry.description,
          startedAtTick: world.tick,
          deadlineTicks: entry.deadlineTicks,
          affectedAgents: aliveTargets,
        };
        due.push(crisis);
      }
      return due;
    },
  };
}
