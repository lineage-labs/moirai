import React, { useEffect } from "react";
import { motion } from "framer-motion";
import { resolveTinyAgentLayout } from "../layoutPhysics";
import { useStore } from "../store";

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
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 24 }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {transfers.map((transfer) => {
          const from = displayPositions[transfer.from];
          const to = displayPositions[transfer.to];
          if (!from || !to) return null;
          const fromX = from.x;
          const fromY = from.y;
          const toX = to.x;
          const toY = to.y;
          const d = `M ${fromX} ${fromY} L ${toX} ${toY}`;
          return (
            <motion.path
              key={transfer.id}
              d={d}
              fill="none"
              stroke="rgba(220, 210, 80, 0.92)"
              strokeWidth={2.5}
              strokeDasharray="10 7"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: [0, 1, 1, 0] }}
              transition={{ duration: 2.6, ease: "easeInOut" }}
              filter="drop-shadow(0 0 6px rgba(220,210,80,0.8))"
            />
          );
        })}
      </svg>
      {transfers.flatMap((transfer) => {
        const from = displayPositions[transfer.from];
        const to = displayPositions[transfer.to];
        if (!from || !to) return [];
        return [
          <FloatingSkillLabel key={`${transfer.id}-mid`} x={(from.x + to.x) / 2} y={(from.y + to.y) / 2} text={transfer.skillName} />,
        ];
      })}
    </div>
  );
}

function FloatingSkillLabel({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: "translate(-50%, -50%)",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.94 }}
        animate={{ opacity: [0, 1, 1, 0], y: [8, 0, -4, -10], scale: [0.94, 1, 1, 0.98] }}
        transition={{ duration: 2.7, ease: "easeOut" }}
        style={{
        padding: "4px 8px",
        borderRadius: 999,
        background: "rgba(21, 32, 18, 0.82)",
        border: "1px solid rgba(156, 224, 148, 0.42)",
        color: "#d6f7b7",
        fontFamily: "'DM Sans', system-ui, sans-serif",
        fontSize: 10,
        fontWeight: 700,
        whiteSpace: "nowrap",
        boxShadow: "0 8px 22px rgba(0,0,0,0.38), 0 0 12px rgba(156,224,148,0.25)",
        }}
      >
        {text}
      </motion.div>
    </div>
  );
}
