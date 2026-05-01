import React, { useEffect } from "react";
import { useStore, connectWs } from "./store";
import { Scene3D } from "./Scene3D";
import { AgentOverlay } from "./AgentOverlay";
import { PauseControl } from "./PauseControl";
import { ActiveCrisesPanel } from "./components/ActiveCrisesPanel";
import { AgentLayer } from "./components/AgentLayer";
import { SelectedAgentPanel } from "./components/SelectedAgentPanel";
import { TickTimeline } from "./components/TickTimeline";
import savannahBg from "./background.png";

const WS_URL = import.meta.env["VITE_WS_URL"] ?? "ws://localhost:8765";

function LionPawIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <path fill="#f2a35e" d="M7 6h2v2h2v5H5V8h2V6Z" />
      <path
        fill="#f2a35e"
        d="M2 5h3v3H2V5Zm4-3h2v3H6V2Zm3 0h2v3H9V2Zm2 3h3v3h-3V5Z"
      />
    </svg>
  );
}

export default function App() {
  const { agents, crises, tick } = useStore();

  useEffect(() => {
    connectWs(WS_URL);
  }, []);

  const activeCrises = Object.values(crises).filter((c) => !c.resolved);
  const alive = Object.values(agents).filter((agent) => agent.alive).length;
  const total = Math.max(Object.keys(agents).length, 1);
  const health = Math.round((alive / total) * 100);
  const day = Math.max(1, Math.floor(tick / 24) + 1);
  const hour = String((6 + tick) % 24).padStart(2, "0");

  return (
    <div style={{
      position: "relative", width: "100vw", height: "100vh", overflow: "hidden",
      backgroundColor: "#100d08",
      backgroundImage: `url(${savannahBg})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <div style={{ position: "absolute", inset: 0, zIndex: 1, background: "radial-gradient(circle at 50% 55%, rgba(255,214,128,0.08), rgba(7,5,3,0.26) 72%), linear-gradient(180deg, rgba(0,0,0,0.18), rgba(0,0,0,0.10) 40%, rgba(0,0,0,0.22))", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <Scene3D />
      </div>

      <AgentLayer />
      <SelectedAgentPanel />
      <ActiveCrisesPanel />
      <TickTimeline />

      {/* Top game HUD */}
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
        <PauseControl />
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
        position: "absolute", top: 0, left: 0, right: 0,
        height: 52,
        zIndex: 50,
        display: "grid",
        gridTemplateColumns: "1.4fr 0.55fr 0.65fr 0.8fr 0.8fr 0.8fr",
        alignItems: "center",
        background: "linear-gradient(180deg, rgba(18,14,10,0.92), rgba(16,13,10,0.74))",
        borderBottom: "1px solid rgba(231, 190, 110, 0.16)",
        boxShadow: "0 16px 38px rgba(0,0,0,0.34)",
        backdropFilter: "blur(10px)",
      }}>
        <HudBrand />
        <HudBlock label="Tick" value={String(tick)} />
        <HudBlock label="Speed" value="x2" />
        <HudBlock label="Day" value={`${day}  ${hour}:45`} />
        <HudBlock label="World Health" value={`${health}%`} meter={health / 100} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 18px", borderLeft: "1px solid rgba(231, 190, 110, 0.12)", height: "100%" }}>
          <LionPawIcon />
          <div>
            <div style={{ color: "#a88f6a", fontSize: 8, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.7 }}>Crisis Level</div>
            <div style={{ color: activeCrises.length ? "#ff8c74" : "#8fd16d", fontSize: 13, fontWeight: 800 }}>
              {activeCrises.length ? "HIGH" : "LOW"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HudBrand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 18 }}>
      <div style={{ width: 26, height: 26, borderRadius: "50%", border: "2px dotted #d4a95f", boxShadow: "0 0 14px rgba(212,169,95,0.24)" }} />
      <div>
        <div style={{ color: "#e9c982", fontSize: 13, fontWeight: 900, letterSpacing: 0.7, textTransform: "uppercase" }}>Emergent Civilisation</div>
        <div style={{ color: "#8e7b61", fontSize: 9 }}>A world of autonomous agents</div>
      </div>
    </div>
  );
}

function HudBlock({ label, value, meter }: { label: string; value: string; meter?: number }) {
  return (
    <div style={{ height: "100%", borderLeft: "1px solid rgba(231, 190, 110, 0.12)", display: "grid", alignContent: "center", padding: "0 18px" }}>
      <div style={{ color: "#a88f6a", fontSize: 8, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.7 }}>{label}</div>
      <div style={{ color: "#f0dfbd", fontSize: 17, fontWeight: 900, lineHeight: 1.1 }}>{value}</div>
      {meter != null && (
        <div style={{ marginTop: 4, width: 72, height: 4, borderRadius: 999, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
          <div style={{ width: `${Math.max(0, Math.min(1, meter)) * 100}%`, height: "100%", background: "#8fd16d" }} />
        </div>
      )}
    </div>
  );
}

function HudBlock({
  label,
  value,
  meter,
}: {
  label: string;
  value: string;
  meter?: number;
}) {
  return (
    <div
      style={{
        height: "100%",
        borderLeft: "1px solid rgba(231, 190, 110, 0.12)",
        display: "grid",
        alignContent: "center",
        padding: "0 18px",
      }}
    >
      <div
        style={{
          color: "#a88f6a",
          fontSize: 8,
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: 0.7,
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: "#f0dfbd",
          fontSize: 17,
          fontWeight: 900,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {meter != null && (
        <div
          style={{
            marginTop: 4,
            width: 72,
            height: 4,
            borderRadius: 999,
            background: "rgba(255,255,255,0.12)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${Math.max(0, Math.min(1, meter)) * 100}%`,
              height: "100%",
              background: "#8fd16d",
            }}
          />
        </div>
      )}
    </div>
  );
}
