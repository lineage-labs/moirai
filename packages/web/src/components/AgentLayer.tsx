import React from "react";
import { resolveTinyAgentLayout } from "../layoutPhysics";
import { useStore } from "../store";
import { LionHuntPathLayer } from "./LionHuntPathLayer";
import { SkillTransferLayer } from "./SkillTransferLayer";
import { TinyAgent } from "./TinyAgent";

export function AgentLayer() {
  const agents = useStore((state) => state.agents);
  const screenPositions = useStore((state) => state.screenPositions);
  const walkOffsets = useStore((state) => state.walkOffsets);
  const lionState = useStore((state) => state.lionState);
  const selectedAgentId = useStore((state) => state.selectedAgentId);
  const targetedAgents = new Set(lionState.active ? lionState.targets : []);
  const agentList = Object.values(agents);
  const layout = resolveTinyAgentLayout(
    agentList.map((agent) => {
      const base = screenPositions[agent.id] ?? agent.position;
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

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 22 }}>
      <SkillTransferLayer />
      <LionHuntPathLayer positions={layout} />
      {agentList.map((agent) => (
        <TinyAgent
          key={agent.id}
          agent={agent}
          position={layout[agent.id] ?? screenPositions[agent.id] ?? agent.position}
          targeted={targetedAgents.has(agent.id)}
          selected={selectedAgentId === agent.id}
        />
      ))}
    </div>
  );
}
