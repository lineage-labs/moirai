import React from "react";
import lionPng from "../assets/lion.png";
import { useStore } from "../store";

const F = "'DM Sans', system-ui, sans-serif";

export function LionHuntBanner() {
  const lionHud = useStore((state) => state.lionHud);

  if (!lionHud) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: lionHud.x,
        top: lionHud.y,
        transform: "translate(-50%, -110%)",
        zIndex: 36,
        pointerEvents: "none",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 0,
        filter: "drop-shadow(0 8px 18px rgba(0,0,0,0.55))",
      }}
    >
      {/* Lion circle icon */}
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: "50%",
          border: "3px solid #e04034",
          overflow: "hidden",
          background: "#0a0604",
          boxShadow:
            "0 0 0 2px rgba(0,0,0,0.4), inset 0 0 14px rgba(255,80,50,0.18)",
          flexShrink: 0,
          zIndex: 1,
          marginRight: -6,
        }}
      >
        <img
          src={lionPng}
          alt=""
          width={52}
          height={52}
          style={{
            display: "block",
            objectFit: "cover",
            transform: "scale(1.08)",
          }}
        />
      </div>
      {/* Text box */}
      <div
        style={{
          padding: "9px 14px 10px 16px",
          borderRadius: "0 10px 10px 0",
          background:
            "linear-gradient(135deg, rgba(130,18,12,0.94), rgba(60,8,5,0.90))",
          border: "1px solid rgba(255, 80, 60, 0.28)",
          borderLeft: "none",
          backdropFilter: "blur(8px)",
          fontFamily: F,
          minWidth: 130,
        }}
      >
        <div
          style={{
            color: "#ff7a5c",
            fontSize: 13,
            fontWeight: 900,
            letterSpacing: 1,
            textTransform: "uppercase",
            lineHeight: 1,
          }}
        >
          🦁 Lion Hunting
        </div>
        <div
          style={{
            color: "#f0e4d0",
            fontSize: 11,
            fontWeight: 600,
            marginTop: 4,
            lineHeight: 1.2,
          }}
        >
          {lionHud.subtitle}
        </div>
      </div>
    </div>
  );
}
