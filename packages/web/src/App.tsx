import React, { useEffect, useCallback } from "react";
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
  const { agents, skills, crises, edges, events, tick } = useStore();
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
    <div style={{ display: "flex", height: "100vh", background: "#0a0a0a" }}>
      {/* Left: Agent graph */}
      <div style={{ flex: "0 0 60%", borderRight: "1px solid #222" }}>
        <div style={{ padding: "8px 16px", borderBottom: "1px solid #222", display: "flex", gap: 16, alignItems: "center" }}>
          <span style={{ color: "#7c3aed", fontWeight: "bold", fontSize: 16 }}>emergent-civ</span>
          <span style={{ color: "#555", fontSize: 12 }}>tick {tick}</span>
          {activeCrises.map((c) => (
            <span
              key={c.id}
              style={{
                background: "#7f1d1d",
                color: "#fca5a5",
                borderRadius: 4,
                padding: "2px 8px",
                fontSize: 11,
              }}
            >
              🦁 {c.type} → {c.targets.join(", ")}
            </span>
          ))}
        </div>
        <ReactFlow
          nodes={nodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          style={{ background: "#0f0f1a" }}
        >
          <Background color="#1e1e2e" />
          <Controls />
        </ReactFlow>
      </div>

      {/* Right: Event feed + Receipts */}
      <div style={{ flex: "0 0 40%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Receipts Gallery */}
        <div style={{ borderBottom: "1px solid #222", padding: 12, maxHeight: "35%", overflowY: "auto" }}>
          <div style={{ color: "#7c3aed", fontSize: 12, marginBottom: 8, fontWeight: "bold" }}>
            RECEIPTS GALLERY ({Object.keys(skills).length})
          </div>
          {Object.values(skills).length === 0 && (
            <div style={{ color: "#444", fontSize: 11 }}>Waiting for first skill...</div>
          )}
          {Object.values(skills).map((s) => (
            <div
              key={s.id}
              style={{
                background: "#111",
                border: "1px solid #2a2a4a",
                borderRadius: 6,
                padding: "6px 10px",
                marginBottom: 6,
                fontSize: 11,
              }}
            >
              <div style={{ color: "#a5b4fc", fontWeight: "bold" }}>{s.name}</div>
              <div style={{ color: "#555", marginTop: 2 }}>
                by {s.inventedBy} · tick {s.tick}
                {s.verifiable && <span style={{ color: "#4ade80", marginLeft: 6 }}>✓ verified</span>}
                {!s.verifiable && <span style={{ color: "#f59e0b", marginLeft: 6 }}>⚠ unverified</span>}
              </div>
              {s.reasonReceipt && (
                <div style={{ color: "#333", fontSize: 10, marginTop: 2, wordBreak: "break-all" }}>
                  reason: {s.reasonReceipt.slice(0, 24)}…
                </div>
              )}
              {s.selfEvalReceipt && (
                <div style={{ color: "#333", fontSize: 10, wordBreak: "break-all" }}>
                  eval: {s.selfEvalReceipt.slice(0, 24)}… score:{" "}
                  <span style={{ color: s.selfEvalScore && s.selfEvalScore >= 0.6 ? "#4ade80" : "#f87171" }}>
                    {s.selfEvalScore?.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Event Feed */}
        <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
          <div style={{ color: "#7c3aed", fontSize: 12, marginBottom: 8, fontWeight: "bold" }}>
            EVENT FEED
          </div>
          <div style={{ display: "flex", flexDirection: "column-reverse" }}>
            {[...events].reverse().map((ev, i) => (
              <div
                key={i}
                style={{
                  fontSize: 10,
                  padding: "2px 0",
                  color: eventColor(ev.kind),
                  borderBottom: "1px solid #111",
                }}
              >
                <span style={{ color: "#333", marginRight: 6 }}>t{ev.tick}</span>
                <span style={{ color: "#555", marginRight: 6 }}>[{ev.actorId}]</span>
                <span>{ev.kind}</span>
                {ev.kind === "CRISIS_OVER" && ev.payload && (
                  <span style={{ color: "#555", marginLeft: 6 }}>
                    {(ev.payload as { killed: string[] }).killed.length > 0 && (
                      <span style={{ color: "#ef4444" }}>✗ {(ev.payload as { killed: string[] }).killed.join(", ")}</span>
                    )}
                    {(ev.payload as { survived: string[] }).survived.length > 0 && (
                      <span style={{ color: "#4ade80", marginLeft: 6 }}>✓ {(ev.payload as { survived: string[] }).survived.join(", ")}</span>
                    )}
                  </span>
                )}
                {ev.kind === "SKILL_DECLINED" && ev.payload && (
                  <span style={{ color: "#555", marginLeft: 6 }}>
                    "{(ev.payload as { skillName: string }).skillName}" score={(ev.payload as { score: number }).score.toFixed(2)}
                    {(ev.payload as { reason?: string }).reason && (
                      <span style={{ color: "#444", marginLeft: 4 }}>— {(ev.payload as { reason: string }).reason}</span>
                    )}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function eventColor(kind: string): string {
  if (kind.startsWith("CRISIS")) return "#f87171";
  if (kind === "CRISIS_OVER") return "#f87171";
  if (kind === "SKILL_DECLINED") return "#fb923c";
  if (kind.startsWith("SKILL")) return "#4ade80";
  if (kind.startsWith("AXL") || kind.startsWith("SKILL_TAUGHT") || kind.startsWith("SKILL_LEARNED")) return "#a78bfa";
  if (kind === "AGENT_DIED") return "#f59e0b";
  if (kind === "AGENT_SPAWNED") return "#60a5fa";
  if (kind === "REASONING_STARTED") return "#facc15";
  return "#444";
}
