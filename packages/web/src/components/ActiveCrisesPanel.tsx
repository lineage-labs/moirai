import React from "react";
import { getEventIcon } from "../eventIcons";
import { useStore } from "../store";

const F = "'DM Sans', system-ui, sans-serif";

export function ActiveCrisesPanel() {
  const crises = useStore((state) => state.crises);
  const tick = useStore((state) => state.tick);
  const active = Object.values(crises).filter((crisis) => !crisis.resolved);
  const lionIcon = getEventIcon("CRISIS_STARTED");

  return (
    <aside
      style={{
        position: "absolute",
        top: 92,
        right: 14,
        width: 218,
        zIndex: 44,
        borderRadius: 12,
        padding: 12,
        background: "linear-gradient(180deg, rgba(28, 22, 15, 0.84), rgba(18, 15, 12, 0.80))",
        border: "1px solid rgba(231, 190, 110, 0.18)",
        boxShadow: "0 22px 58px rgba(0,0,0,0.44), inset 0 1px 0 rgba(255,235,180,0.08)",
        backdropFilter: "blur(12px)",
        fontFamily: F,
        color: "#f0dfbd",
      }}
    >
      <div style={{ color: "#bda16f", fontSize: 9, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 }}>
        Active Crises
      </div>
      {active.length === 0 ? (
        <div style={{ color: "#8d7b63", fontSize: 11 }}>No active threats</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {active.map((crisis) => {
            const type = crisis.type.toLowerCase();
            const eta = Math.max(0, crisis.startedAtTick + crisis.deadlineTicks - tick);
            const isLion = type === "lion";
            return (
              <div key={crisis.id} style={{ padding: 9, borderRadius: 9, background: "rgba(0,0,0,0.24)", border: "1px solid rgba(255,220,150,0.10)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center", background: isLion ? "rgba(176,55,38,0.22)" : "rgba(210,160,80,0.18)", border: "1px solid rgba(255,220,150,0.18)" }}>
                    {lionIcon && <img src={lionIcon} alt="" width={20} height={20} style={{ filter: "brightness(0) saturate(100%) invert(73%) sepia(47%) saturate(592%) hue-rotate(341deg) brightness(94%) contrast(92%)" }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: isLion ? "#ff9a7a" : "#e7c684", fontSize: 12, fontWeight: 800, textTransform: "capitalize" }}>
                      {type} {isLion ? "Hunting" : "Crisis"}
                    </div>
                    <div style={{ color: "#a99578", fontSize: 10 }}>ETA: {eta} ticks</div>
                  </div>
                  <span style={{ color: isLion ? "#ff8c74" : "#dfbd70", fontSize: 8, fontWeight: 800, border: "1px solid currentColor", borderRadius: 4, padding: "2px 4px" }}>
                    {isLion ? "HIGH" : "MED"}
                  </span>
                </div>
                {isLion && crisis.targets.length > 0 && (
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
                    {crisis.targets.map((target) => (
                      <span key={target} style={{ color: "#ffd1c5", fontSize: 9, fontWeight: 700, padding: "3px 6px", borderRadius: 999, background: "rgba(210, 60, 44, 0.22)", border: "1px solid rgba(255, 113, 90, 0.22)" }}>
                        target: {target}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
