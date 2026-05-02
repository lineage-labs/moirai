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

function healthPct(agent: AgentInfo): number {
  if (!agent.alive) return 0;
  if (!agent.hunger || agent.hunger.threshold <= 0) return 85;
  return Math.max(0, Math.min(100, Math.round((1 - agent.hunger.current / agent.hunger.threshold) * 100)));
}

function healthColor(pct: number): string {
  if (pct > 55) return "#4cdb6e";
  if (pct > 25) return "#e5bd5d";
  return "#e45a45";
}

export function TinyAgent({ agent, position, walkOffset, targeted, selected }: TinyAgentProps) {
  const selectAgent = useStore((state) => state.selectAgent);
  const crises = useStore((state) => state.crises);
  const personality = getPersonality(agent.id);
  const x = position.x + (walkOffset?.dx ?? 0);
  const y = position.y + (walkOffset?.dy ?? 0);
  const color = agent.alive ? statusColor[agent.status] : "#777067";
  const hp = healthPct(agent);
  const hpColor = healthColor(hp);

  const inHungerCrisis = agent.alive && Object.values(crises).some(
    (c) => !c.resolved && c.type.toLowerCase() === "hunger" && c.targets.includes(agent.id),
  );

  return (
    <motion.button
      type="button"
      onClick={() => selectAgent(agent.id)}
      animate={{ left: x, top: y }}
      transition={{ type: "spring", stiffness: 90, damping: 18 }}
      style={{
        position: "absolute",
        transform: "translate(-50%, -72%)",
        width: 88,
        height: 120,
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
            bottom: 4,
            width: 56,
            height: 14,
            transform: "translateX(-50%)",
            borderRadius: "50%",
            background: "rgba(0,0,0,0.35)",
            filter: "blur(3px)",
          }}
        />
        {/* Health bar */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: -6,
            width: 62,
            height: 5,
            transform: "translateX(-50%)",
            borderRadius: 999,
            background: "rgba(0,0,0,0.55)",
            overflow: "hidden",
            border: "1px solid rgba(0,0,0,0.4)",
          }}
        >
          <motion.div
            animate={{ width: `${hp}%` }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            style={{
              height: "100%",
              background: hpColor,
              borderRadius: 999,
              boxShadow: inHungerCrisis ? `0 0 10px #e45a45` : hp <= 25 ? `0 0 6px ${hpColor}` : "none",
            }}
          />
        </div>

        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 4,
            width: 64,
            height: 64,
            transform: "translateX(-50%)",
            borderRadius: "50%",
            border: selected ? "3px solid #f6cf74" : `2.5px solid ${color}`,
            background: "rgba(25,18,10,0.82)",
            boxShadow: selected
              ? "0 0 22px rgba(246,207,116,0.72), 0 8px 18px rgba(0,0,0,0.45)"
              : "0 8px 18px rgba(0,0,0,0.45)",
            overflow: "hidden",
            zIndex: 2,
          }}
        >
          <img src={getAgentAvatar(agent.id)} alt="" width={64} height={64} style={{ display: "block" }} />
        </div>

        {/* Hunger thought bubble */}
        {inHungerCrisis && (
          <motion.div
            animate={{ scale: [1, 1.08, 1], opacity: [0.88, 1, 0.88] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            style={{
              position: "absolute",
              left: "50%",
              top: -52,
              transform: "translateX(-10%)",
              zIndex: 5,
              pointerEvents: "none",
            }}
          >
            {/* Thought trail dots */}
            <div style={{ position: "absolute", bottom: -4, left: 6, width: 5, height: 5, borderRadius: "50%", background: "rgba(210,210,210,0.88)", boxShadow: "0 1px 4px rgba(0,0,0,0.4)" }} />
            <div style={{ position: "absolute", bottom: -10, left: 2, width: 3.5, height: 3.5, borderRadius: "50%", background: "rgba(200,200,200,0.75)", boxShadow: "0 1px 3px rgba(0,0,0,0.35)" }} />
            <div style={{ position: "absolute", bottom: -14, left: 0, width: 2.5, height: 2.5, borderRadius: "50%", background: "rgba(190,190,190,0.62)", boxShadow: "0 1px 2px rgba(0,0,0,0.3)" }} />
            {/* Main bubble */}
            <div style={{
              width: 38,
              height: 34,
              borderRadius: 18,
              background: "rgba(220,218,214,0.92)",
              boxShadow: "0 3px 10px rgba(0,0,0,0.4)",
              display: "grid",
              placeItems: "center",
              fontSize: 18,
              lineHeight: 1,
            }}>
              🍕
            </div>
          </motion.div>
        )}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 68,
            width: 20,
            height: 22,
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
            top: 92,
            transform: "translateX(-50%)",
            color: "#f1d99e",
            fontFamily: F_LABEL,
            fontSize: 11,
            fontWeight: 700,
            lineHeight: 1,
            textShadow: "0 2px 4px rgba(0,0,0,0.9)",
            whiteSpace: "nowrap",
          }}
        >
          {personality.name}
        </div>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 106,
            transform: "translateX(-50%)",
            fontSize: 13,
            lineHeight: 1,
          }}
        >
          {!agent.alive ? "💀" : targeted ? "🏃" : inHungerCrisis ? "🥵" : agent.status === "reasoning" ? "🤔" : "😊"}
        </div>
        {targeted && (
          <div style={{ position: "absolute", left: 0, right: 0, top: 38, height: 46, zIndex: 1 }}>
            <LionTargetRing />
          </div>
        )}
      </motion.div>
    </motion.button>
  );
}
