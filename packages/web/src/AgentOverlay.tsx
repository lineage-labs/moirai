import React from "react";
import { getAgentAvatar } from "./agentAvatars";
import { getItemIcon, getItemLabel } from "./items";
import { getAgentInventory, getPersonality } from "./personalities";
import { useStore, type AgentInfo, type ScreenPosition } from "./store";

const F_PIXEL = "'Press Start 2P', monospace";
const F_BODY = "'VT323', monospace";

const STATUS_COLOR: Record<AgentInfo["status"], string> = {
  idle: "#68d391",
  reasoning: "#f7d154",
  crisis: "#ff6b4a",
};

export function energyRatioFromHunger(hunger: NonNullable<AgentInfo["hunger"]>): number {
  if (hunger.threshold <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - hunger.current / hunger.threshold));
}

type LayoutPoint = { id: string; x: number; y: number };

type LayoutOptions = {
  width: number;
  height: number;
  reservedRight: number;
  cardWidth: number;
  cardHeight: number;
};

export function resolveAgentLayout(points: LayoutPoint[], options: LayoutOptions): Record<string, ScreenPosition> {
  const halfW = options.cardWidth / 2;
  const halfH = options.cardHeight / 2;
  const maxX = Math.max(halfW, options.width - options.reservedRight - halfW);
  const maxY = Math.max(halfH, options.height - halfH);
  const gap = 18;
  const xSlots: number[] = [];
  const ySlots: number[] = [];
  for (let x = halfW; x <= maxX + 0.1; x += options.cardWidth + gap) xSlots.push(x);
  if (xSlots[xSlots.length - 1] !== maxX) xSlots.push(maxX);
  for (let y = halfH; y <= maxY + 0.1; y += options.cardHeight + gap) ySlots.push(y);
  if (ySlots[ySlots.length - 1] !== maxY) ySlots.push(maxY);

  const candidateSlots = xSlots.flatMap((x) => ySlots.map((y) => ({ x, y })));
  const placed: Array<LayoutPoint & { left: number; right: number; top: number; bottom: number }> = [];
  const result: Record<string, ScreenPosition> = {};

  for (const point of [...points].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const desired = {
      x: Math.max(halfW, Math.min(maxX, point.x)),
      y: Math.max(halfH, Math.min(maxY, point.y)),
    };
    const sortedCandidates = candidateSlots
      .map((candidate) => ({ ...candidate, distance: Math.hypot(candidate.x - desired.x, candidate.y - desired.y) }))
      .sort((a, b) => a.distance - b.distance);
    const chosen = sortedCandidates.find((candidate) => {
      const box = { left: candidate.x - halfW, right: candidate.x + halfW, top: candidate.y - halfH, bottom: candidate.y + halfH };
      return !placed.some((other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top);
    }) ?? { ...desired, distance: 0 };

    const placedBox = { id: point.id, x: chosen.x, y: chosen.y, left: chosen.x - halfW, right: chosen.x + halfW, top: chosen.y - halfH, bottom: chosen.y + halfH };
    placed.push(placedBox);
    result[point.id] = { x: chosen.x, y: chosen.y };
  }

  return result;
}

function HungerBar({ hunger }: { hunger: AgentInfo["hunger"] }) {
  if (!hunger) return null;
  const energyPct = energyRatioFromHunger(hunger);
  const color = energyPct > 0.55 ? "#4ade80" : energyPct > 0.25 ? "#facc15" : "#ef4444";

  return (
    <div
      title={`HP ${Math.round(energyPct * 100)}%`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        width: 122,
        margin: "0 auto 5px",
        padding: "3px 5px",
        background: "rgba(12,8,5,0.72)",
        border: "1px solid rgba(255,223,154,0.3)",
        borderRadius: 999,
        boxShadow: "0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)",
      }}
    >
      <span style={{ color, fontFamily: F_PIXEL, fontSize: 6, lineHeight: 1 }}>HP</span>
      <div style={{ flex: 1, height: 8, borderRadius: 999, background: "rgba(0,0,0,0.62)", overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
        <div
          style={{
            width: `${energyPct * 100}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${color}, #fff0a6)`,
            boxShadow: `0 0 8px ${color}`,
            transition: "width 450ms ease, background 300ms, box-shadow 300ms",
          }}
        />
      </div>
    </div>
  );
}

function InventoryStrip({ agentId }: { agentId: string }) {
  const inventory = getAgentInventory(agentId);
  if (inventory.length === 0) return null;

  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 5 }}>
      {inventory.map((item) => (
        <div
          key={item}
          title={getItemLabel(item)}
          style={{
            width: 26,
            height: 26,
            display: "grid",
            placeItems: "center",
            background: "rgba(20,14,8,0.72)",
            border: "1px solid rgba(255,223,154,0.36)",
            borderRadius: 5,
            boxShadow: "0 3px 10px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.1)",
          }}
        >
          <img src={getItemIcon(item)} alt={getItemLabel(item)} width={20} height={20} style={{ imageRendering: "pixelated" }} />
        </div>
      ))}
    </div>
  );
}

function TargetRing() {
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: 2,
        width: 118,
        height: 42,
        transform: "translateX(-50%)",
        border: "5px solid rgba(255, 54, 54, 0.78)",
        borderRadius: "50%",
        boxShadow: "0 0 18px rgba(255,54,54,0.62), inset 0 0 14px rgba(255,54,54,0.2)",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}

function AgentCard({ agent, targeted, listed }: { agent: AgentInfo; targeted: boolean; listed: boolean }) {
  const personality = getPersonality(agent.id);
  const statusColor = listed ? "#f0c040" : agent.alive ? STATUS_COLOR[agent.status] : "#7a6d5d";

  return (
    <div
      style={{
        width: 176,
        textAlign: "center",
        opacity: agent.alive ? 1 : 0.46,
        transition: "opacity 250ms",
      }}
    >
      {agent.alive && <HungerBar hunger={agent.hunger} />}
      <InventoryStrip agentId={agent.id} />
      <div style={{ position: "relative", display: "inline-block" }}>
        <img
          src={getAgentAvatar(agent.id)}
          alt={`${personality.name} avatar`}
          width={88}
          height={88}
          style={{ display: "block", filter: "drop-shadow(0 10px 12px rgba(0,0,0,0.42))" }}
        />
        {listed && (
          <div style={{
            position: "absolute", top: 0, right: 0,
            width: 28, height: 28,
            borderRadius: "50%",
            background: "rgba(10,8,4,0.82)",
            border: "1.5px solid #f0c040",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 15, lineHeight: 1,
            zIndex: 10,
            boxShadow: "0 2px 8px rgba(0,0,0,0.7), 0 0 10px rgba(240,192,64,0.4)",
          }}>
            💰
          </div>
        )}
      </div>
      <div style={{ position: "relative", width: 132, height: 10, margin: "0 auto" }}>
        {targeted && <TargetRing />}
      </div>
      <div
        style={{
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          minWidth: 118,
          padding: "6px 8px 7px",
          background: "rgba(18, 16, 14, 0.58)",
          border: `1px solid ${statusColor}`,
          borderRadius: 8,
          backdropFilter: "blur(10px)",
          boxShadow: `0 8px 22px rgba(0,0,0,0.34), 0 0 16px ${statusColor}26`,
        }}
      >
        <div style={{ color: "#ffe0a3", fontFamily: F_PIXEL, fontSize: 8, letterSpacing: 0.4 }}>
          {personality.name}
        </div>
        <div style={{ color: statusColor, fontFamily: F_BODY, fontSize: 13, letterSpacing: 0.7, textTransform: "uppercase" }}>
          {listed ? "for sale" : agent.alive ? agent.status : "dead"} / {agent.knownSkillIds.length} skills
        </div>
      </div>
    </div>
  );
}

export function AgentOverlay() {
  const agents = useStore((state) => state.agents);
  const lionState = useStore((state) => state.lionState);
  const screenPositions = useStore((state) => state.screenPositions);
  const listedAgentIds = useStore((state) => state.listedAgentIds);
  const agentList = Object.values(agents);
  const targetedAgents = new Set(lionState.active ? lionState.targets : []);
  const layout = resolveAgentLayout(
    agentList.map((agent) => ({
      id: agent.id,
      x: screenPositions[agent.id]?.x ?? agent.position.x,
      y: screenPositions[agent.id]?.y ?? agent.position.y,
    })),
    {
      width: typeof window === "undefined" ? 1280 : window.innerWidth,
      height: typeof window === "undefined" ? 720 : window.innerHeight,
      reservedRight: 470,
      cardWidth: 176,
      cardHeight: 236,
    },
  );

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 20 }}>
      {agentList.map((agent) => (
        <div
          key={agent.id}
          style={{
            position: "absolute",
            left: layout[agent.id]?.x ?? 0,
            top: layout[agent.id]?.y ?? 0,
            transform: "translate(-50%, -50%)",
            transition: "left 350ms ease, top 350ms ease",
          }}
        >
          <AgentCard agent={agent} targeted={targetedAgents.has(agent.id)} listed={listedAgentIds[agent.id] ?? false} />
        </div>
      ))}
    </div>
  );
}
