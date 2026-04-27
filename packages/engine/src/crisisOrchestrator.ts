import type { Crisis, Environment, WorldState } from "@moirai/shared";

const FIELD_W = 100;
const FIELD_H = 60;
const DEFAULT_RADIUS = 35;

export type CrisisOrchestrator = {
  step(world: WorldState): Crisis[];
};

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

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

        const position = entry.position ?? {
          x: Math.random() * FIELD_W,
          y: Math.random() * FIELD_H,
        };
        const radius = entry.radius ?? DEFAULT_RADIUS;

        const alreadyFacing = new Set(
          world.activeCrises
            .filter((c) => c.type === entry.type)
            .flatMap((c) => c.affectedAgents),
        );

        const candidates = (entry.targets
          ? entry.targets.filter((id) => world.agents[id]?.alive)
          : Object.values(world.agents)
              .filter((a) => a.alive && dist(a.position, position) <= radius)
              .map((a) => a.id)
        ).filter((id) => !alreadyFacing.has(id));

        if (candidates.length === 0) continue;

        const crisis: Crisis = {
          id: `${entry.type.toLowerCase()}_${nextSerial++}`,
          type: entry.type,
          description: entry.description,
          startedAtTick: world.tick,
          deadlineTicks: entry.deadlineTicks,
          affectedAgents: candidates,
          position,
        };
        due.push(crisis);
      }
      return due;
    },
  };
}
