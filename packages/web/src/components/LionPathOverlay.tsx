import React from "react";
import { useStore } from "../store";

function angleDeg(x1: number, y1: number, x2: number, y2: number): number {
  return Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
}

function PawPrint({ x, y, angle }: { x: number; y: number; angle: number }) {
  // Paw oriented pointing along travel direction
  return (
    <g transform={`translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${(angle + 90).toFixed(1)})`} opacity={0.9}>
      {/* Main central pad */}
      <ellipse cx="0" cy="4.5" rx="5" ry="4.5" fill="#c8020a" />
      {/* 4 toe pads */}
      <ellipse cx="-4.2" cy="-0.5" rx="2.2" ry="2.6" fill="#c8020a" />
      <ellipse cx="-1.4" cy="-5"   rx="2.2" ry="2.6" fill="#c8020a" />
      <ellipse cx=" 1.4" cy="-5"   rx="2.2" ry="2.6" fill="#c8020a" />
      <ellipse cx=" 4.2" cy="-0.5" rx="2.2" ry="2.6" fill="#c8020a" />
    </g>
  );
}

export function LionPathOverlay() {
  const pts = useStore((s) => s.lionPathScreenPoints);
  const lionState = useStore((s) => s.lionState);

  if (!lionState.active || pts.length < 2) return null;

  const d = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  // Paw print every 7th point, alternating left/right of the path
  const paws = pts
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i % 7 === 3);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 26 }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {/* Soft glow under path */}
        <path d={d} fill="none" stroke="rgba(180,8,8,0.22)" strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
        {/* Dashed red trail */}
        <path d={d} fill="none" stroke="#d10408" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="11 9" />
        {/* Paw prints */}
        {paws.map(({ p, i }, pawIdx) => {
          const next = pts[Math.min(i + 2, pts.length - 1)]!;
          const angle = angleDeg(p.x, p.y, next.x, next.y);
          // Alternate offset perpendicular to travel direction
          const perpRad = (angle + 90) * (Math.PI / 180);
          const side = pawIdx % 2 === 0 ? 9 : -9;
          return (
            <PawPrint
              key={i}
              x={p.x + Math.cos(perpRad) * side}
              y={p.y + Math.sin(perpRad) * side}
              angle={angle}
            />
          );
        })}
      </svg>
    </div>
  );
}
