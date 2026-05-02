import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { resolveTinyAgentLayout } from "../layoutPhysics";
import { useStore } from "../store";

const F = "'DM Sans', system-ui, sans-serif";
const COLOR = "#00FFEF";

// Quadratic bezier point at parameter t
function qbez(ax: number, bx: number, cx: number, t: number) {
  const u = 1 - t;
  return u * u * ax + 2 * u * t * bx + t * t * cx;
}

// Build N keyframe positions along the quadratic bezier
function bezierKeyframes(fx: number, fy: number, mx: number, my: number, tx: number, ty: number, n = 16) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    xs.push(qbez(fx, mx, tx, t));
    ys.push(qbez(fy, my, ty, t));
  }
  return { xs, ys };
}

export function SkillTransferLayer() {
  const transfers = useStore((state) => state.skillTransfers);
  const agents = useStore((state) => state.agents);
  const positions = useStore((state) => state.screenPositions);
  const walkOffsets = useStore((state) => state.walkOffsets);
  const clearExpiredSkillTransfers = useStore((state) => state.clearExpiredSkillTransfers);

  const displayPositions = resolveTinyAgentLayout(
    Object.values(agents).map((agent) => {
      const base = positions[agent.id] ?? agent.position;
      const offset = walkOffsets[agent.id] ?? { dx: 0, dy: 0 };
      return { id: agent.id, x: base.x + offset.dx, y: base.y + offset.dy };
    }),
    {
      width: typeof window === "undefined" ? 1280 : window.innerWidth,
      height: typeof window === "undefined" ? 720 : window.innerHeight,
      reservedRight: 250,
      reservedBottom: 104,
      minDistance: 64,
    },
  );

  useEffect(() => {
    const id = window.setInterval(() => clearExpiredSkillTransfers(), 350);
    return () => window.clearInterval(id);
  }, [clearExpiredSkillTransfers]);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 30 }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <defs>
          {transfers.map((transfer) => (
            <marker
              key={`arrow-${transfer.id}`}
              id={`arrow-${transfer.id}`}
              markerWidth="8" markerHeight="8"
              refX="7" refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L8,3 Z" fill={COLOR} opacity={0.9} />
            </marker>
          ))}
        </defs>

        <AnimatePresence>
          {transfers.map((transfer) => {
            const from = displayPositions[transfer.from];
            const to = displayPositions[transfer.to];
            if (!from || !to) return null;

            const mx = (from.x + to.x) / 2;
            const my = Math.min(from.y, to.y) - 70;
            const d = `M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`;

            const { xs, ys } = bezierKeyframes(from.x, from.y, mx, my, to.x, to.y);

            return (
              <motion.g
                key={transfer.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                {/* Soft glow */}
                <path d={d} fill="none" stroke={`rgba(0,255,239,0.12)`} strokeWidth={6} strokeLinecap="round" />
                {/* Dotted curve with arrowhead */}
                <path
                  d={d}
                  fill="none"
                  stroke={COLOR}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeDasharray="3 6"
                  markerEnd={`url(#arrow-${transfer.id})`}
                />
                {/* Moving dot travelling source → destination */}
                <motion.circle
                  r={4}
                  fill={COLOR}
                  opacity={0.9}
                  style={{ filter: `drop-shadow(0 0 4px ${COLOR})` }}
                  initial={{ cx: xs[0], cy: ys[0] }}
                  animate={{ cx: xs, cy: ys }}
                  transition={{ duration: 1.4, ease: "easeInOut" }}
                />
                <motion.circle
                  r={2}
                  fill="white"
                  initial={{ cx: xs[0], cy: ys[0] }}
                  animate={{ cx: xs, cy: ys }}
                  transition={{ duration: 1.4, ease: "easeInOut" }}
                />
              </motion.g>
            );
          })}
        </AnimatePresence>
      </svg>

      {/* Inline label at arc peak */}
      <AnimatePresence>
        {transfers.map((transfer) => {
          const from = displayPositions[transfer.from];
          const to = displayPositions[transfer.to];
          if (!from || !to) return null;
          const mx = (from.x + to.x) / 2;
          const my = Math.min(from.y, to.y) - 70;
          const labelX = qbez(from.x, mx, to.x, 0.5);
          const labelY = qbez(from.y, my, to.y, 0.5);
          return (
            <motion.div
              key={`label-${transfer.id}`}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.3 }}
              style={{
                position: "absolute",
                left: labelX,
                top: labelY - 16,
                transform: "translateX(-50%)",
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 8px",
                borderRadius: 5,
                background: "linear-gradient(180deg, rgba(28,22,15,0.94), rgba(16,13,10,0.90))",
                border: `1px solid rgba(0,255,239,0.32)`,
                boxShadow: `0 0 8px rgba(0,255,239,0.15), 0 4px 10px rgba(0,0,0,0.5)`,
                fontFamily: F,
                fontSize: 10,
                fontWeight: 700,
                color: "#f0dfbd",
                whiteSpace: "nowrap",
                backdropFilter: "blur(6px)",
              }}
            >
              <span style={{ color: COLOR, fontWeight: 900, fontSize: 9 }}>whisper</span>
              {transfer.skillName}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
