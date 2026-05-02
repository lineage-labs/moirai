import React, { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useStore, type AgentInfo, type ScreenPosition } from "./store";
import { quadraticBezier3D, quadraticBezierDerivative3D } from "./lionPathCurve";
import { buildLionRoute, type LionRoute } from "./lionHuntRoute";
import { LION_ENTRY_WORLD_POINT, WORLD_CENTER, WORLD_SCALE } from "./worldPhysics";
import lionPng from "./assets/lion.png";

const LION_TINT_HUNT = new THREE.Color(0xffd6b8);
const LION_TINT_IDLE = new THREE.Color(0xffffff);
/** Smaller on-map lion sprite (banner carries the big read) */
const LION_SPRITE_BASE = 1.05;

function movingDirectionSubtitle(vel: THREE.Vector3): string {
  const { x, z } = vel;
  const len = Math.hypot(x, z);
  if (len < 0.06) return "Closing in";
  const deg = (THREE.MathUtils.radToDeg(Math.atan2(x, z)) + 360) % 360;
  const cardinals = ["North", "Northeast", "East", "Southeast", "South", "Southwest", "West", "Northwest"];
  const idx = Math.round(deg / 45) % 8;
  return `Moving ${cardinals[idx]}`;
}

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

function LionHuntWorld() {
  const agents = useStore((state) => state.agents);
  const crises = useStore((state) => state.crises);
  const lionState = useStore((state) => state.lionState);
  const route = useMemo(() => buildLionRoute(agents, crises, lionState), [agents, crises, lionState]);

  return (
    <>
      <LionActor route={route} />
      <LionPathSync />
    </>
  );
}

type SavedRoute = { start: THREE.Vector3; control: THREE.Vector3; final: THREE.Vector3 };

function LionActor({ route }: { route: LionRoute }) {
  const group = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.SpriteMaterial>(null);
  const curveDest = useRef(new THREE.Vector3());
  const derivOut = useRef(new THREE.Vector3());
  const derivTmp = useRef(new THREE.Vector3());
  const worldScratch = useRef(new THREE.Vector3());
  const { camera, size } = useThree();
  const texture = useSceneTexture(lionPng, false);
  const lionState = useStore((state) => state.lionState);

  // Return-journey state: saved when active→inactive
  const wasActiveRef = useRef(false);
  const returnRef = useRef<{ savedRoute: SavedRoute; progress: number; startMs: number } | null>(null);
  // Always keep the last-active route so retreat can use real bezier, not the degenerate post-crisis one
  const lastActiveRouteRef = useRef<SavedRoute & { startedAtMs: number }>({
    start:       new THREE.Vector3(LION_ENTRY_WORLD_POINT.x, 0.95, LION_ENTRY_WORLD_POINT.z),
    control:     new THREE.Vector3(LION_ENTRY_WORLD_POINT.x, 0.95, LION_ENTRY_WORLD_POINT.z),
    final:       new THREE.Vector3(LION_ENTRY_WORLD_POINT.x, 0.95, LION_ENTRY_WORLD_POINT.z),
    startedAtMs: Date.now(),
  });

  useFrame((_state, delta) => {
    if (!group.current || !materialRef.current) return;

    // Always snapshot wasActive FIRST so all paths below see consistent transition
    const prevActive = wasActiveRef.current;
    wasActiveRef.current = lionState.active;

    // Save real route every frame while hunting (before it becomes degenerate after crisis ends)
    if (lionState.active) {
      lastActiveRouteRef.current = {
        start:       route.start.clone(),
        control:     route.control.clone(),
        final:       route.final.clone(),
        startedAtMs: route.startedAtMs,
      };
    }

    // ── Detect kill: active→inactive → start retreat ───────────────────────
    if (prevActive && !lionState.active && !returnRef.current) {
      const r = lastActiveRouteRef.current;
      const forwardProgress = THREE.MathUtils.clamp((Date.now() - r.startedAtMs) / 30000, 0, 1);
      returnRef.current = {
        savedRoute: { start: r.start.clone(), control: r.control.clone(), final: r.final.clone() },
        progress:   Math.max(0.05, forwardProgress),
        startMs:    Date.now(),
      };
    }

    // ── If a new hunt started while retreating, cancel retreat ─────────────
    if (returnRef.current && lionState.active) {
      returnRef.current = null;
    }

    // ── Return animation ───────────────────────────────────────────────────
    if (returnRef.current) {
      const r = returnRef.current;
      const returnDuration = Math.max(800, r.progress * 5000);
      const t = Math.min(1, (Date.now() - r.startMs) / returnDuration);
      const retProgress = r.progress * (1 - t);
      const retPos = quadraticBezier3D(r.savedRoute.start, r.savedRoute.control, r.savedRoute.final, retProgress, curveDest.current);
      group.current.position.copy(retPos);

      useStore.getState().setLionHud(null);

      if (t >= 1) {
        returnRef.current = null;
        useStore.getState().setLionHud(null);
      }
      return;
    }

    // ── Idle (no crisis, no retreat) ───────────────────────────────────────
    if (!lionState.active) {
      useStore.getState().setLionHud(null);
      return;
    }

    // ── Normal hunt ────────────────────────────────────────────────────────
    const progress = THREE.MathUtils.clamp((Date.now() - route.startedAtMs) / 30000, 0, 1);
    const destination = quadraticBezier3D(route.start, route.control, route.final, progress, curveDest.current);
    group.current.position.lerp(destination, Math.min(delta * 2.8, 1));
    group.current.position.y = destination.y;

    materialRef.current.opacity = THREE.MathUtils.lerp(materialRef.current.opacity, 0, Math.min(delta * 3, 1));
    materialRef.current.color.lerp(LION_TINT_HUNT, Math.min(delta * 2.2, 1));

    const hasTangent = progress > 0.002;
    if (hasTangent) {
      quadraticBezierDerivative3D(route.start, route.control, route.final, progress, derivOut.current, derivTmp.current);
      group.current.scale.set(LION_SPRITE_BASE * (derivOut.current.x >= 0 ? 1 : -1), LION_SPRITE_BASE, 1);
    } else {
      group.current.scale.set(LION_SPRITE_BASE, LION_SPRITE_BASE, 1);
    }

    worldScratch.current.copy(destination).project(camera);
    const sx = (worldScratch.current.x * 0.5 + 0.5) * size.width;
    const sy = (-worldScratch.current.y * 0.5 + 0.5) * size.height;
    const subtitle = hasTangent ? movingDirectionSubtitle(derivOut.current) : "On the prowl";
    useStore.getState().setLionHud({ x: Math.round(sx), y: Math.round(sy), subtitle });
  });

  return (
    <group ref={group} position={[LION_ENTRY_WORLD_POINT.x, 0.95, LION_ENTRY_WORLD_POINT.z]}>
      <sprite scale={[LION_SPRITE_BASE, LION_SPRITE_BASE, 1]} visible={false}>
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

function LionPathSync() {
  const { camera, size } = useThree();
  const setLionPathScreenPoints = useStore((s) => s.setLionPathScreenPoints);
  const agents = useStore((s) => s.agents);
  const crises = useStore((s) => s.crises);
  const lionState = useStore((s) => s.lionState);
  const route = useMemo(
    () => buildLionRoute(agents, crises, lionState),
    [agents, crises, lionState],
  );

  useFrame(() => {
    if (!lionState.active) {
      setLionPathScreenPoints([]);
      return;
    }
    const pts: ScreenPosition[] = [];
    const tmp = new THREE.Vector3();
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      quadraticBezier3D(route.start, route.control, route.final, t, tmp);
      const projected = tmp.clone().project(camera);
      pts.push({
        x: (projected.x * 0.5 + 0.5) * size.width,
        y: (-projected.y * 0.5 + 0.5) * size.height,
      });
    }
    setLionPathScreenPoints(pts);
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
      <LionHuntWorld />
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
