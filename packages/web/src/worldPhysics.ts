import type { ScreenPosition } from "./store";

export type WorldPoint = { x: number; z: number };
export type WorldActorPoint = { id: string; point: WorldPoint };

export const WORLD_SCALE = 0.018;
export const WORLD_CENTER = { x: 400, y: 240 };
export const LION_ENTRY_WORLD_POINT: WorldPoint = { x: -8.5, z: -5 };

export function worldPointFromScreenPosition(position: ScreenPosition): WorldPoint {
  return {
    x: (position.x - WORLD_CENTER.x) * WORLD_SCALE,
    z: (position.y - WORLD_CENTER.y) * WORLD_SCALE,
  };
}

export function computeLionFinalPoint({
  targets,
  blockers,
}: {
  targets: WorldActorPoint[];
  blockers: WorldActorPoint[];
}): WorldPoint {
  if (targets.length === 0) return { x: 9.5, z: 0 };

  const centroid = targets.reduce(
    (acc, target) => ({ x: acc.x + target.point.x, z: acc.z + target.point.z }),
    { x: 0, z: 0 },
  );
  centroid.x /= targets.length;
  centroid.z /= targets.length;

  // Pack hunt: land exactly between targeted agents (screen + curve read as one confrontation).
  if (targets.length > 1) {
    return { x: centroid.x, z: centroid.z };
  }

  let final = { x: centroid.x + 0.62, z: centroid.z + 0.78 };
  const closestTarget = targets
    .map((target) => ({ target, distance: distance(final, target.point) }))
    .sort((a, b) => a.distance - b.distance)[0]!.target;

  // Repel the lion from non-target agents so the attack reads as aimed at the actual target.
  for (const blocker of blockers) {
    const blockerDistance = distance(final, blocker.point);
    if (blockerDistance >= 1.55) continue;
    const away = normalize({ x: final.x - blocker.point.x, z: final.z - blocker.point.z });
    const strength = (1.55 - blockerDistance) * 0.9;
    final = {
      x: final.x + away.x * strength,
      z: final.z + away.z * strength,
    };
  }

  const targetDistance = distance(final, closestTarget.point);
  const nearestBlockerDistance = blockers.reduce((min, blocker) => Math.min(min, distance(final, blocker.point)), Infinity);
  if (nearestBlockerDistance <= targetDistance) {
    const towardTarget = normalize({ x: closestTarget.point.x - final.x, z: closestTarget.point.z - final.z });
    final = {
      x: final.x + towardTarget.x * (targetDistance - nearestBlockerDistance + 0.2),
      z: final.z + towardTarget.z * (targetDistance - nearestBlockerDistance + 0.2),
    };
  }

  return final;
}

function distance(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function normalize(vector: WorldPoint): WorldPoint {
  const length = Math.max(0.001, Math.hypot(vector.x, vector.z));
  return { x: vector.x / length, z: vector.z / length };
}
