import React from "react";
import { useStore } from "../store";

export function LionPathOverlay() {
  const pts = useStore((s) => s.lionPathScreenPoints);
  const lionState = useStore((s) => s.lionState);

  if (!lionState.active || pts.length < 2) return null;

  // Build SVG polyline path string from projected points
  const d = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 26 }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {/* Shadow/glow layer */}
        <path
          d={d}
          fill="none"
          stroke="rgba(180,10,10,0.35)"
          strokeWidth={10}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Main dashed red path */}
        <path
          d={d}
          fill="none"
          stroke="#c8030a"
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="9 7"
        />
        {/* Bright highlight stripe */}
        <path
          d={d}
          fill="none"
          stroke="rgba(255,100,80,0.55)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="9 7"
        />
        {/* Paw print dots at intervals */}
        {pts
          .filter((_, i) => i % 6 === 3)
          .map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={4}
              fill="#e02020"
              opacity={0.8}
            />
          ))}
      </svg>
    </div>
  );
}
