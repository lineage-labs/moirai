import React, { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useStore, type AgentInfo, type ScreenPosition } from "./store";
import { computeLionFinalPoint, WORLD_CENTER, WORLD_SCALE } from "./worldPhysics";
import lionPng from "./assets/lion.png";

function agentWorldPosition(agent: AgentInfo, y = 0.9): THREE.Vector3 {
  return new THREE.Vector3(
    (agent.position.x - WORLD_CENTER.x) * WORLD_SCALE,
    y,
    (agent.position.y - WORLD_CENTER.y) * WORLD_SCALE,
  );
}

function activeAgentWorldPosition(agent: AgentInfo, y = 0.9): THREE.Vector3 {
  const position = agentWorldPosition(agent, y);
  return position;
}

function useSceneTexture(src: string, pixelated = true): THREE.Texture {
  const texture = useLoader(THREE.TextureLoader, src);
  useEffect(() => {
    texture.magFilter = pixelated ? THREE.NearestFilter : THREE.LinearFilter;
    texture.minFilter = pixelated ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = !pixelated;
    texture.needsUpdate = true;
  }, [pixelated, texture]);
  return texture;
}

function LionActor() {
  const group = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.SpriteMaterial>(null);
  const texture = useSceneTexture(lionPng, false);
  const agents = useStore((state) => state.agents);
  const crises = useStore((state) => state.crises);
  const lionState = useStore((state) => state.lionState);
  const tick = useStore((state) => state.tick);

  const destination = useMemo(() => {
    const targetAgents = lionState.targets.map((id) => agents[id]).filter(Boolean) as AgentInfo[];
    const activeCrisis = lionState.crisisId ? crises[lionState.crisisId] : undefined;
    const approachTicks = Math.max(1, Math.min(6, activeCrisis?.deadlineTicks ?? 6));
    const progress = activeCrisis
      ? THREE.MathUtils.clamp((tick - activeCrisis.startedAtTick) / approachTicks, 0, 1)
      : 0;

    if (targetAgents.length === 0) return new THREE.Vector3(9.5, 1, 0);
    const targetIds = new Set(targetAgents.map((agent) => agent.id));
    const finalPoint = computeLionFinalPoint({
      targets: targetAgents.map((agent) => {
        const point = activeAgentWorldPosition(agent, 0.95);
        return { id: agent.id, point: { x: point.x, z: point.z } };
      }),
      blockers: Object.values(agents)
        .filter((agent) => agent.alive && !targetIds.has(agent.id))
        .map((agent) => {
          const point = activeAgentWorldPosition(agent, 0.95);
          return { id: agent.id, point: { x: point.x, z: point.z } };
        }),
    });
    const final = new THREE.Vector3(finalPoint.x, 0.95, finalPoint.z);
    const start = new THREE.Vector3(10.5, 0.95, final.z + 1.8);
    return start.lerp(final, progress);
  }, [agents, crises, lionState, tick]);

  useFrame(({ clock }, delta) => {
    if (!group.current || !materialRef.current) return;
    const targetPosition = lionState.active ? destination : new THREE.Vector3(10.5, 0.95, destination.z);
    group.current.position.lerp(targetPosition, Math.min(delta * 2.8, 1));
    group.current.position.y = 0.95 + Math.sin(clock.elapsedTime * 5) * 0.04;
    materialRef.current.opacity = THREE.MathUtils.lerp(materialRef.current.opacity, lionState.active ? 1 : 0, Math.min(delta * 3, 1));
  });

  return (
    <group ref={group} position={[9.5, 0.95, 0]}>
      <sprite scale={[1.7, 1.7, 1]}>
        <spriteMaterial ref={materialRef} map={texture} transparent opacity={0} depthWrite={false} />
      </sprite>
    </group>
  );
}

function ProjectionSync() {
  const agents = useStore((state) => state.agents);
  const lionState = useStore((state) => state.lionState);
  const setScreenPositions = useStore((state) => state.setScreenPositions);
  const { camera, size } = useThree();
  const elapsed = useRef(0);

  useFrame((_, delta) => {
    elapsed.current += delta;
    if (elapsed.current < 1 / 30) return;
    elapsed.current = 0;

    const screenPositions: Record<string, ScreenPosition> = {};
    for (const agent of Object.values(agents)) {
      const projected = activeAgentWorldPosition(agent, 1.85).project(camera);
      screenPositions[agent.id] = {
        x: (projected.x * 0.5 + 0.5) * size.width,
        y: (-projected.y * 0.5 + 0.5) * size.height,
      };
    }
    setScreenPositions(screenPositions);
  });

  return null;
}

function CameraRig() {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 7.5, 8.2);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}

function SceneContent() {
  return (
    <>
      <ambientLight intensity={1.8} />
      <LionActor />
      <ProjectionSync />
      <CameraRig />
    </>
  );
}

export function Scene3D() {
  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: false, alpha: true }}
      orthographic
      camera={{ zoom: 52, near: 0.1, far: 100 }}
      style={{ position: "absolute", inset: 0, background: "transparent" }}
    >
      <SceneContent />
    </Canvas>
  );
}
