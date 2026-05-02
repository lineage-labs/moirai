import React, { useEffect, useMemo, useState } from "react";
import { quadraticBezier2D, quadraticControl2D } from "../lionPathCurve";
import { useStore, type ScreenPosition } from "../store";

const APPROACH_DURATION_MS = 30000;
const PATH_START: ScreenPosition = { x: 118, y: 106 };

export function LionHuntPathLayer({
  positions,
}: {
  positions: Record<string, ScreenPosition>;
}) {
  const lionState = useStore((state) => state.lionState);
  const crises = useStore((state) => state.crises);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const activeCrisis = lionState.crisisId ? crises[lionState.crisisId] : undefined;
  const targetPoints = lionState.active
    ? lionState.targets.map((id) => positions[id]).filter(Boolean) as ScreenPosition[]
    : [];

  useEffect(() => {
    if (!lionState.active) return;
    let raf = 0;
    const loop = () => {
      setNowMs(Date.now());
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, [lionState.active]);

  const end = useMemo(() => {
    if (targetPoints.length === 0) return null;
    const sum = targetPoints.reduce(
      (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
      { x: 0, y: 0 },
    );
    return {
      x: sum.x / targetPoints.length,
      y: sum.y / targetPoints.length - 16,
    };
  }, [targetPoints]);

  if (!lionState.active || !activeCrisis || !end) return null;

  const progress = Math.max(0, Math.min(1, (nowMs - activeCrisis.startedAtMs) / APPROACH_DURATION_MS));
  const control = quadraticControl2D(PATH_START, end, 0.44);
  const pathD = `M ${PATH_START.x} ${PATH_START.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
  const totalPaws = 12;
  const visiblePaws = Math.max(1, Math.floor(totalPaws * progress));

  return (
    <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}>
      <path
        d={pathD}
        fill="none"
        stroke="rgba(255, 112, 96, 0.95)"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: "drop-shadow(0 0 8px rgba(255,86,66,0.75))" }}
      />
      {Array.from({ length: visiblePaws }, (_, index) => {
        const t = (index + 1) / totalPaws;
        const paw = quadraticBezier2D(PATH_START, control, end, t);
        return <LionPaw key={index} x={paw.x} y={paw.y} />;
      })}
    </svg>
  );
}

function LionPaw({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x - 6}, ${y - 6})`} opacity={0.96}>
      <circle cx={2.5} cy={2.6} r={1.2} fill="#ff6f5d" />
      <circle cx={9.4} cy={2.6} r={1.2} fill="#ff6f5d" />
      <circle cx={5.9} cy={0.8} r={1.1} fill="#ff6f5d" />
      <path d="M2.2 4.4h7.3l-0.8 6H3.1z" fill="#ff6f5d" />
    </g>
  );
}
