import React from "react";
import { motion } from "framer-motion";
import { getEventIcon } from "../eventIcons";
import { tickHeadlines } from "../timeline";
import { useStore } from "../store";

const F = "'DM Sans', system-ui, sans-serif";

export function TickTimeline() {
  const tick = useStore((state) => state.tick);
  const events = useStore((state) => state.events);
  const start = Math.max(0, tick - 4);
  const ticks = Array.from({ length: 9 }, (_, index) => start + index);

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: 12,
        transform: "translateX(-50%)",
        width: "min(960px, calc(100vw - 34px))",
        zIndex: 42,
        display: "grid",
        gridTemplateColumns: "repeat(9, minmax(0, 1fr))",
        gap: 8,
        padding: 10,
        borderRadius: 12,
        background: "linear-gradient(180deg, rgba(28,22,15,0.80), rgba(15,12,10,0.78))",
        border: "1px solid rgba(231, 190, 110, 0.18)",
        boxShadow: "0 18px 48px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,235,180,0.08)",
        backdropFilter: "blur(12px)",
        pointerEvents: "none",
        fontFamily: F,
      }}
    >
      {ticks.map((entryTick) => {
        const headlines = tickHeadlines(events, entryTick);
        const primary = headlines[0] ?? { kind: "IDLE" as const, title: "World breathing", actorId: "world" };
        const isCurrent = entryTick === tick;
        const icon = getEventIcon(primary.kind);
        return (
          <motion.div
            layout
            key={entryTick}
            style={{
              minHeight: 52,
              borderRadius: 9,
              padding: "6px 8px",
              background: isCurrent ? "rgba(198, 151, 63, 0.22)" : "rgba(0,0,0,0.22)",
              border: isCurrent ? "1px solid rgba(242, 204, 122, 0.55)" : "1px solid rgba(255,220,150,0.08)",
              boxShadow: isCurrent ? "0 0 18px rgba(242,204,122,0.22)" : "none",
            }}
          >
            <div style={{ color: isCurrent ? "#f6cf74" : "#8d7b63", fontSize: 8, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase", textAlign: "center", marginBottom: 5 }}>
              {isCurrent ? "NOW" : "Tick"} {entryTick}
            </div>
            <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center", background: "rgba(255,220,150,0.08)", border: "1px solid rgba(255,220,150,0.10)", flexShrink: 0 }}>
                {icon ? <img src={icon} alt="" width={16} height={16} style={{ filter: "brightness(0) saturate(100%) invert(75%) sepia(28%) saturate(579%) hue-rotate(352deg) brightness(94%) contrast(88%)" }} /> : <span style={{ color: "#a99578", fontSize: 10 }}>•</span>}
              </div>
              <div style={{ minWidth: 0 }}>
                {(headlines.length > 0 ? headlines : [primary]).map((headline, index) => (
                  <div key={`${headline.kind}-${headline.actorId}-${index}`} style={{ marginBottom: index === headlines.length - 1 ? 0 : 2 }}>
                    <div style={{ color: index === 0 ? "#e4d1a8" : "#c3ac7f", fontSize: index === 0 ? 9.5 : 8.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {headline.title}
                    </div>
                    <div style={{ color: "#927c5f", fontSize: 7.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {headline.actorId}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
