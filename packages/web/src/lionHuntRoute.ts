import * as THREE from "three";
import type { AgentInfo, CrisisInfo, LionState } from "./store";
import { quadraticControl3DXZ } from "./lionPathCurve";
import { computeLionFinalPoint, LION_ENTRY_WORLD_POINT, WORLD_CENTER, WORLD_SCALE } from "./worldPhysics";

export type LionRoute = {
  start: THREE.Vector3;
  control: THREE.Vector3;
  final: THREE.Vector3;
  startedAtMs: number;
};

function agentWorldPosition(agent: AgentInfo, y = 0.9): THREE.Vector3 {
  return new THREE.Vector3(
    (agent.position.x - WORLD_CENTER.x) * WORLD_SCALE,
    y,
    (agent.position.y - WORLD_CENTER.y) * WORLD_SCALE,
  );
}

/** Same curve as `LionActor` — used for the 3D hunt line so it sits on the world plane (not screen-space “sky”). */
export function buildLionRoute(
  agents: Record<string, AgentInfo>,
  crises: Record<string, CrisisInfo>,
  lionState: LionState,
): LionRoute {
  const targetAgents = lionState.targets.map((id) => agents[id]).filter(Boolean) as AgentInfo[];

  const start = new THREE.Vector3(LION_ENTRY_WORLD_POINT.x, 0.95, LION_ENTRY_WORLD_POINT.z);
  if (targetAgents.length === 0) {
    return {
      start,
      control: start.clone(),
      final: start.clone(),
      startedAtMs: Date.now(),
    };
  }

  const targetIds = new Set(targetAgents.map((agent) => agent.id));
  const finalPoint = computeLionFinalPoint({
    targets: targetAgents.map((agent) => {
      const point = agentWorldPosition(agent, 0.95);
      return { id: agent.id, point: { x: point.x, z: point.z } };
    }),
    blockers: Object.values(agents)
      .filter((agent) => agent.alive && !targetIds.has(agent.id))
      .map((agent) => {
        const point = agentWorldPosition(agent, 0.95);
        return { id: agent.id, point: { x: point.x, z: point.z } };
      }),
  });
  const final = new THREE.Vector3(finalPoint.x, 0.95, finalPoint.z);
  const control = quadraticControl3DXZ(start, final, 0.45);
  const activeCrisis = lionState.crisisId ? crises[lionState.crisisId] : undefined;

  return {
    start,
    control,
    final,
    startedAtMs: activeCrisis?.startedAtMs ?? Date.now(),
  };
}
