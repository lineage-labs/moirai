import React from "react";
import { motion } from "framer-motion";
import { getAgentAvatar } from "../agentAvatars";
import { getPersonality } from "../personalities";
import { useStore, type AgentInfo, type ScreenPosition, type WalkOffset } from "../store";
import { LionTargetRing } from "./LionTargetRing";

const F_LABEL = "'DM Sans', system-ui, sans-serif";

type TinyAgentProps = {
  agent: AgentInfo;
  position: ScreenPosition;
  walkOffset?: WalkOffset;
  targeted: boolean;
  selected: boolean;
};

const statusColor: Record<AgentInfo["status"], string> = {
  idle: "#72c56a",
  reasoning: "#e5bd5d",
  crisis: "#ef5a45",
};

export function TinyAgent({ agent, position, walkOffset, targeted, selected }: TinyAgentProps) {
  const selectAgent = useStore((state) => state.selectAgent);
  const personality = getPersonality(agent.id);
  const x = position.x + (walkOffset?.dx ?? 0);
  const y = position.y + (walkOffset?.dy ?? 0);
  const color = agent.alive ? statusColor[agent.status] : "#777067";

  return (
    <motion.button
      type="button"
      onClick={() => selectAgent(agent.id)}
      animate={{ left: x, top: y }}
      transition={{ type: "spring", stiffness: 90, damping: 18 }}
      style={{
        position: "absolute",
        transform: "translate(-50%, -72%)",
        width: 58,
        height: 78,
        border: "none",
        padding: 0,
        background: "transparent",
        cursor: "pointer",
        pointerEvents: "auto",
        opacity: agent.alive ? 1 : 0.5,
      }}
      aria-label={`Select ${personality.name}`}
    >
      <motion.div
        animate={{ y: [0, -2, 0], rotate: [-1, 1, -1] }}
        transition={{ duration: 1.35, repeat: Infinity, ease: "easeInOut" }}
        style={{ position: "relative", width: "100%", height: "100%" }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 6,
            width: 38,
            height: 12,
            transform: "translateX(-50%)",
            borderRadius: "50%",
            background: "rgba(0,0,0,0.35)",
            filter: "blur(3px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 7,
            width: 40,
            height: 40,
            transform: "translateX(-50%)",
            borderRadius: "50%",
            border: selected ? "3px solid #f6cf74" : `2px solid ${color}`,
            background: "rgba(25,18,10,0.82)",
            boxShadow: selected
              ? "0 0 18px rgba(246,207,116,0.68), 0 8px 18px rgba(0,0,0,0.45)"
              : "0 8px 18px rgba(0,0,0,0.45)",
            overflow: "hidden",
            zIndex: 2,
          }}
        >
          <img src={getAgentAvatar(agent.id)} alt="" width={40} height={40} style={{ display: "block" }} />
        </div>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 46,
            width: 16,
            height: 18,
            transform: "translateX(-50%)",
            borderRadius: "8px 8px 4px 4px",
            background: `linear-gradient(180deg, ${color}, rgba(38,29,17,0.92))`,
            border: "1px solid rgba(0,0,0,0.35)",
            boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 64,
            transform: "translateX(-50%)",
            color: "#f1d99e",
            fontFamily: F_LABEL,
            fontSize: 9,
            fontWeight: 700,
            lineHeight: 1,
            textShadow: "0 2px 4px rgba(0,0,0,0.9)",
            whiteSpace: "nowrap",
          }}
        >
          {personality.name}
        </div>
        {targeted && (
          <div style={{ position: "absolute", left: 0, right: 0, top: 32, height: 40, zIndex: 1 }}>
            <LionTargetRing />
          </div>
        )}
      </motion.div>
    </motion.button>
  );
}
