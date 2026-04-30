import React, { useEffect, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
} from "reactflow";
import "reactflow/dist/style.css";
import { useStore, connectWs } from "./store";
import savannahBg from "./background.png";
import { EventPanel } from "./EventPanel";

const WS_URL = import.meta.env["VITE_WS_URL"] ?? "ws://localhost:8765";

const STATUS_COLOR: Record<string, string> = {
  idle: "#4ade80",
  reasoning: "#facc15",
  crisis: "#f87171",
};

function AgentNode({ data }: {
  data: {
    label: string;
    status: string;
    skillCount: number;
    alive: boolean;
    hunger?: { current: number; threshold: number };
  };
}) {
  const color = data.alive ? (STATUS_COLOR[data.status] ?? "#4ade80") : "#555";
  const hungerPct = data.hunger ? Math.min(data.hunger.current / data.hunger.threshold, 1) : null;
  const hungerColor = hungerPct == null ? null
    : hungerPct > 0.75 ? "#ef4444"
    : hungerPct > 0.5 ? "#f97316"
    : "#facc15";

  return (
    <div
      style={{
        background: "#1a1a2e",
        border: `2px solid ${color}`,
        borderRadius: 12,
        padding: "10px 16px",
        minWidth: 120,
        textAlign: "center",
        opacity: data.alive ? 1 : 0.4,
        boxShadow: data.status === "reasoning" ? `0 0 12px ${color}` : "none",
        transition: "all 0.3s",
      }}
    >
      <div style={{ fontWeight: "bold", color, fontSize: 14 }}>{data.label}</div>
      <div style={{ color: "#888", fontSize: 11, marginTop: 4 }}>
        {data.alive ? data.status : "dead"} · {data.skillCount} skills
      </div>
      {hungerPct != null && data.alive && (
        <div style={{ marginTop: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#555", marginBottom: 2 }}>
            <span>hunger</span>
            <span>{data.hunger!.current}/{data.hunger!.threshold}</span>
          </div>
          <div style={{ background: "#0a0a0a", borderRadius: 4, height: 4, overflow: "hidden" }}>
            <div style={{
              width: `${hungerPct * 100}%`,
              height: "100%",
              background: hungerColor!,
              transition: "width 0.4s, background 0.4s",
            }} />
          </div>
        </div>
      )}
    </div>
  );
}

const nodeTypes = { agent: AgentNode };

export default function App() {
  const { agents, crises, edges, events, tick } = useStore();
  const [showPanel, setShowPanel] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    connectWs(WS_URL);
  }, []);

  useEffect(() => {
    const rfNodes: Node[] = Object.values(agents).map((a) => ({
      id: a.id,
      type: "agent",
      position: a.position,
      data: { label: a.id, status: a.status, skillCount: a.knownSkillIds.length, alive: a.alive, hunger: a.hunger },
    }));
    setNodes(rfNodes);
  }, [agents, setNodes]);

  useEffect(() => {
    const rfEdgesNew: Edge[] = edges.map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      label: e.label,
      animated: true,
      style: { stroke: "#7c3aed" },
      labelStyle: { fill: "#c4b5fd", fontSize: 10 },
    }));
    setEdges(rfEdgesNew);
  }, [edges, setEdges]);

  const activeCrises = Object.values(crises).filter((c) => !c.resolved);

  return (
    <div style={{
      position: "relative", width: "100vw", height: "100vh", overflow: "hidden",
      backgroundImage: `url(${savannahBg})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    }}>

      {/* ReactFlow fills the entire canvas — no background of its own */}
      <div style={{ position: "absolute", inset: 0 }}>
        <ReactFlow
          nodes={nodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          style={{ background: "transparent" }}
        >
          <Controls />
        </ReactFlow>
      </div>

      {/* Tick + crisis bar — floats top-left */}
      <div style={{
        position: "absolute", top: 12, left: 12,
        display: "flex", gap: 10, alignItems: "center",
        background: "rgba(10,6,2,0.55)", backdropFilter: "blur(8px)",
        borderRadius: 8, padding: "5px 12px",
        border: "1px solid rgba(255,255,255,0.10)",
      }}>
        <span style={{ color: "#e8d8b8", fontWeight: 600, fontSize: 13 }}>emergent-civ</span>
        <span style={{ color: "#7a6848", fontSize: 11 }}>tick {tick}</span>
        {activeCrises.map((c) => (
          <span key={c.id} style={{ background: "rgba(180,60,30,0.6)", color: "#fca5a5", borderRadius: 4, padding: "2px 8px", fontSize: 11 }}>
            🦁 {c.type} → {c.targets.join(", ")}
          </span>
        ))}
      </div>

      {/* Event panel + vertical toggle tab — floats right */}
      <div style={{
        position: "absolute", top: 12, right: 12, bottom: 12,
        display: "flex", flexDirection: "row", alignItems: "stretch", gap: 0,
      }}>
        {showPanel && (
          <EventPanel
            events={events}
            onHide={() => setShowPanel(false)}
            style={{ width: 430, borderRadius: "8px 0 0 8px" }}
          />
        )}

        {/* Vertical tab — always visible */}
        <button
          onClick={() => setShowPanel(p => !p)}
          title={showPanel ? "Hide event log" : "Show event log"}
          style={{
            width: 24,
            background: "rgba(18,16,14,0.52)",
            border: "1px solid rgba(255,255,255,0.13)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.35), 0 4px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.09)",
            borderRadius: showPanel ? "0 8px 8px 0" : 8,
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            padding: 0,
            flexShrink: 0,
            alignSelf: "flex-start",
            height: 120,
          }}
        >
          <span style={{
            writingMode: "vertical-rl",
            textOrientation: "mixed",
            fontSize: 9,
            letterSpacing: 2,
            fontWeight: 500,
            color: "#7a6a50",
            fontFamily: "'DM Sans', system-ui, sans-serif",
            textTransform: "uppercase",
            userSelect: "none",
          }}>EVENTS</span>
          <span style={{ fontSize: 10, color: "#9a8a70", userSelect: "none" }}>
            {showPanel ? "▶" : "◀"}
          </span>
        </button>
      </div>
    </div>
  );
}

