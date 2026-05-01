import React, { useEffect, useState } from "react";
import ReactFlow, {
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
} from "reactflow";
import "reactflow/dist/style.css";
import { useStore, connectWs } from "./store";
import { EventPanel } from "./EventPanel";
import { Scene3D } from "./Scene3D";
import { AgentOverlay } from "./AgentOverlay";
import savannahBg from "./background.png";

const WS_URL = import.meta.env["VITE_WS_URL"] ?? "ws://localhost:8765";

function LionPawIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" style={{ display: "block" }}>
      <path fill="#f2a35e" d="M7 6h2v2h2v5H5V8h2V6Z" />
      <path fill="#f2a35e" d="M2 5h3v3H2V5Zm4-3h2v3H6V2Zm3 0h2v3H9V2Zm2 3h3v3h-3V5Z" />
    </svg>
  );
}

export default function App() {
  const { agents, crises, edges, events, tick, screenPositions } = useStore();
  const [showPanel, setShowPanel] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    connectWs(WS_URL);
  }, []);

  useEffect(() => {
    const rfNodes: Node[] = Object.values(agents).map((a) => {
      const projected = screenPositions[a.id];
      return {
        id: a.id,
        position: projected ? { x: projected.x, y: projected.y + 92 } : a.position,
        data: {},
        selectable: false,
        draggable: false,
        style: {
          width: 1,
          height: 1,
          opacity: 0,
          background: "transparent",
          border: "none",
          padding: 0,
        },
      };
    });
    setNodes(rfNodes);
  }, [agents, screenPositions, setNodes]);

  useEffect(() => {
    const rfEdgesNew: Edge[] = edges.map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      label: e.label,
      animated: true,
      type: "smoothstep",
      style: { stroke: "#c4a8ff", strokeWidth: 1.4, opacity: 0.42, strokeDasharray: "6 7" },
      labelStyle: { fill: "#e6d7ff", fontSize: 10, fontFamily: "'VT323', monospace" },
      labelBgStyle: { fill: "rgba(18,16,14,0.75)", fillOpacity: 0.9 },
    }));
    setEdges(rfEdgesNew);
  }, [edges, setEdges]);

  const activeCrises = Object.values(crises).filter((c) => !c.resolved);

  return (
    <div style={{
      position: "relative", width: "100vw", height: "100vh", overflow: "hidden",
      backgroundColor: "#130f0a",
      backgroundImage: `url(${savannahBg})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
    }}>
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <Scene3D />
      </div>

      <AgentOverlay />

      <div style={{ position: "absolute", inset: 0, zIndex: 10, pointerEvents: "none" }}>
        <ReactFlow
          nodes={nodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
          style={{ background: "transparent" }}
        />
      </div>

      {/* Tick + crisis bar — floats top-left */}
      <div style={{
        position: "absolute", top: 12, left: 12,
        zIndex: 30,
        display: "flex", gap: 10, alignItems: "center",
        background: "rgba(10,6,2,0.55)", backdropFilter: "blur(8px)",
        borderRadius: 8, padding: "5px 12px",
        border: "1px solid rgba(255,255,255,0.10)",
      }}>
        <span style={{ color: "#ffe0a3", fontWeight: 600, fontSize: 10, fontFamily: "'Press Start 2P', monospace" }}>moirai</span>
        <span style={{ color: "#c5a66d", fontSize: 13, fontFamily: "'VT323', monospace" }}>tick {tick}</span>
        {activeCrises.map((c) => (
          <span
            key={c.id}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(180,60,30,0.6)",
              color: "#ffc9a8",
              borderRadius: 4,
              padding: "3px 8px",
              fontSize: 12,
              fontFamily: "'VT323', monospace",
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            <LionPawIcon /> {c.type} {"->"} {c.targets.join(", ")}
          </span>
        ))}
      </div>

      {/* Event panel + vertical toggle tab — floats right */}
      <div style={{
        position: "absolute", top: 12, right: 12, bottom: 12,
        zIndex: 40,
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

