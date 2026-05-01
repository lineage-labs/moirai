import React, { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useStore, type AgentInfo, type LionState, type ScreenPosition } from "./store";
import lionPng from "./assets/lion.png";

const WORLD_SCALE = 0.018;
const WORLD_CENTER = { x: 400, y: 240 };

function agentWorldPosition(agent: AgentInfo, y = 0.9): THREE.Vector3 {
  return new THREE.Vector3(
    (agent.position.x - WORLD_CENTER.x) * WORLD_SCALE,
    y,
    (agent.position.y - WORLD_CENTER.y) * WORLD_SCALE,
  );
}

function activeAgentWorldPosition(agent: AgentInfo, lionState: LionState, y = 0.9): THREE.Vector3 {
  const position = agentWorldPosition(agent, y);
  if (!lionState.active) return position;

  const targetIndex = lionState.targets.indexOf(agent.id);
  if (targetIndex === -1) return position;

  const side = targetIndex % 2 === 0 ? -1 : 1;
  position.x += side * 1.05;
  position.z += targetIndex % 2 === 0 ? 0.65 : -0.65;
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
  const lionState = useStore((state) => state.lionState);

  const target = useMemo(() => {
    const targetAgents = lionState.targets.map((id) => agents[id]).filter(Boolean) as AgentInfo[];
    if (targetAgents.length === 0) return new THREE.Vector3(8, 1, 0);
    const centroid = targetAgents.reduce((acc, agent) => acc.add(activeAgentWorldPosition(agent, lionState, 0.95)), new THREE.Vector3());
    centroid.divideScalar(targetAgents.length);
    if (targetAgents.length === 1) {
      centroid.x += 1.85;
      centroid.z += 3.2;
    } else {
      centroid.x += 0.35;
      centroid.z += 1.95;
    }
    return centroid;
  }, [agents, lionState]);

  useFrame(({ clock }, delta) => {
    if (!group.current || !materialRef.current) return;
    const destination = lionState.active ? target : new THREE.Vector3(9.5, 1, target.z);
    group.current.position.lerp(destination, Math.min(delta * 2.2, 1));
    group.current.position.y = 0.95 + Math.sin(clock.elapsedTime * 5) * 0.04;
    materialRef.current.opacity = THREE.MathUtils.lerp(materialRef.current.opacity, lionState.active ? 1 : 0, Math.min(delta * 3, 1));
  });

  return (
    <group ref={group} position={[9.5, 0.95, 0]}>
      <sprite scale={[1.85, 1.85, 1]}>
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
      const projected = activeAgentWorldPosition(agent, lionState, 2.25).project(camera);
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
  const agents = useStore((state) => state.agents);
  const lionState = useStore((state) => state.lionState);

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
