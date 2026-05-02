import React, { useEffect, useState } from "react";
import { useStore, connectWs } from "./store";
import { Scene3D } from "./Scene3D";
import { PauseControl } from "./PauseControl";
import { ActiveCrisesPanel } from "./components/ActiveCrisesPanel";
import { AgentLayer } from "./components/AgentLayer";
import { LionHuntBanner } from "./components/LionHuntBanner";
import { SelectedAgentPanel } from "./components/SelectedAgentPanel";
import { TickTimeline } from "./components/TickTimeline";
import { DeathBanner } from "./components/DeathBanner";
import { SkillGallery } from "./components/SkillGallery";
import { MarketplaceModal } from "./components/MarketplaceModal";
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

function ShopIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 01-8 0" />
    </svg>
  );
}

export default function App() {
  const { agents, crises, tick } = useStore();
  const [showMarketplace, setShowMarketplace] = useState(false);

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
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        backgroundColor: "#100d08",
        backgroundImage: `url(${savannahBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
    >
      <div style={{ position: "absolute", inset: 0, zIndex: 1, background: "radial-gradient(circle at 50% 55%, rgba(255,214,128,0.08), rgba(7,5,3,0.26) 72%), linear-gradient(180deg, rgba(0,0,0,0.18), rgba(0,0,0,0.10) 40%, rgba(0,0,0,0.22))", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <Scene3D />
      </div>

      <AgentLayer />
      <DeathBanner />
      <LionHuntBanner />
      <SelectedAgentPanel />
      <ActiveCrisesPanel />
      <SkillGallery />
      <TickTimeline />
      <TickCounter tick={tick} />

      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        height: 52,
        zIndex: 50,
        display: "grid",
        gridTemplateColumns: "1.4fr 0.7fr 0.9fr 0.9fr 0.85fr 128px",
        alignItems: "center",
        background: "linear-gradient(180deg, rgba(18,14,10,0.92), rgba(16,13,10,0.74))",
        borderBottom: "1px solid rgba(231, 190, 110, 0.16)",
        boxShadow: "0 16px 38px rgba(0,0,0,0.34)",
        backdropFilter: "blur(10px)",
      }}>
        <HudBrand />
        <HudSpeed />
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
        <div />
      </div>

      {/* Marketplace circle button */}
      <button
        type="button"
        onClick={() => setShowMarketplace((v) => !v)}
        title="Marketplace"
        aria-label="Toggle marketplace"
        style={{
          position: "absolute",
          bottom: 116,
          left: 17,
          zIndex: 45,
          width: 56,
          height: 56,
          borderRadius: "50%",
          border: showMarketplace
            ? "1.5px solid rgba(141,174,107,0.65)"
            : "1px solid rgba(231, 190, 110, 0.28)",
          background: showMarketplace
            ? "rgba(141,174,107,0.18)"
            : "linear-gradient(180deg, rgba(32,24,16,0.92), rgba(18,14,10,0.88))",
          color: showMarketplace ? "#a9c882" : "#c4a46f",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          backdropFilter: "blur(10px)",
          boxShadow: showMarketplace
            ? "0 0 28px rgba(141,174,107,0.22), 0 8px 24px rgba(0,0,0,0.44)"
            : "0 8px 24px rgba(0,0,0,0.44)",
          transition: "all 0.18s",
        }}
      >
        <ShopIcon />
      </button>

      {showMarketplace && (
        <MarketplaceModal onClose={() => setShowMarketplace(false)} />
      )}
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

function HudSpeed() {
  return (
    <div style={{ height: "100%", borderLeft: "1px solid rgba(231, 190, 110, 0.12)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "0 18px" }}>
      <div>
        <div style={{ color: "#a88f6a", fontSize: 8, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.7 }}>Speed</div>
        <div style={{ color: "#f0dfbd", fontSize: 17, fontWeight: 900, lineHeight: 1.1 }}>x2</div>
      </div>
      <PauseControl />
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

function TickCounter({ tick }: { tick: number }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 10,
        right: 14,
        zIndex: 62,
        width: 106,
        borderRadius: 12,
        padding: "10px 12px 9px",
        background: "linear-gradient(180deg, rgba(32, 24, 14, 0.92), rgba(16, 12, 8, 0.84))",
        border: "1px solid rgba(231, 190, 110, 0.26)",
        boxShadow: "0 20px 48px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,235,180,0.10)",
        backdropFilter: "blur(12px)",
        textAlign: "center",
      }}
    >
      <div style={{ color: "#bda16f", fontSize: 9, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase" }}>Tick</div>
      <div style={{ color: "#f6cf74", fontSize: 34, fontWeight: 950, lineHeight: 1, marginTop: 3, textShadow: "0 0 18px rgba(246,207,116,0.28)" }}>
        {tick}
      </div>
    </div>
  );
}