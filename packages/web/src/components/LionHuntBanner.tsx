import React from "react";
import lionPng from "../assets/lion.png";
import { useStore } from "../store";

const F = "'DM Sans', system-ui, sans-serif";

export function LionHuntBanner() {
  const lionHud = useStore((state) => state.lionHud);
  const lionState = useStore((state) => state.lionState);

  if (!lionState.active || !lionHud) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: lionHud.x,
        top: lionHud.y,
        transform: "translate(-50%, -115%)",
        zIndex: 36,
        pointerEvents: "none",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        filter: "drop-shadow(0 10px 22px rgba(0,0,0,0.45))",
      }}
    >
      <div style={{ position: "relative", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: "50%",
            border: "3px solid #e04034",
            overflow: "hidden",
            background: "#0a0604",
            boxShadow: "0 0 0 2px rgba(0,0,0,0.35), inset 0 0 12px rgba(255,90,60,0.15)",
          }}
        >
          <img src={lionPng} alt="" width={46} height={46} style={{ display: "block", objectFit: "cover", transform: "scale(1.06)" }} />
        </div>
        <div
          style={{
            width: 0,
            height: 0,
            marginTop: -1,
            borderLeft: "7px solid transparent",
            borderRight: "7px solid transparent",
            borderTop: "9px solid #e04034",
          }}
          aria-hidden
        />
      </div>
      <div
        style={{
          minWidth: 0,
          maxWidth: 220,
          padding: "8px 12px 9px",
          borderRadius: 10,
          background: "linear-gradient(180deg, rgba(18,12,8,0.92), rgba(10,8,6,0.88))",
          border: "1px solid rgba(255, 90, 70, 0.22)",
          backdropFilter: "blur(8px)",
          fontFamily: F,
        }}
      >
        <div style={{ color: "#ff7a5c", fontSize: 11, fontWeight: 900, letterSpacing: 0.9, textTransform: "uppercase", lineHeight: 1.15 }}>
          Lion hunting
        </div>
        <div style={{ color: "#f2ebe3", fontSize: 11, fontWeight: 600, marginTop: 3, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {lionHud.subtitle}
        </div>
      </div>
    </div>
  );
}
