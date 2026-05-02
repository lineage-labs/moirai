import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { getEventIcon } from "../eventIcons";
import { recentEventHeadlines, type TickHeadline } from "../timeline";
import { useStore } from "../store";

const F = "'DM Sans', system-ui, sans-serif";

type EventTone = {
  bg: string;
  border: string;
  iconBg: string;
  text: string;
  accent: string;
  filter: string;
};

const TONES: Record<string, EventTone> = {
  danger: {
    bg: "rgba(76, 19, 15, 0.62)",
    border: "rgba(239, 92, 69, 0.36)",
    iconBg: "rgba(210, 55, 40, 0.25)",
    text: "#ffd0c4",
    accent: "#ff7967",
    filter: "brightness(0) saturate(100%) invert(61%) sepia(48%) saturate(2794%) hue-rotate(326deg) brightness(104%) contrast(101%)",
  },
  skill: {
    bg: "rgba(75, 56, 16, 0.58)",
    border: "rgba(225, 178, 73, 0.34)",
    iconBg: "rgba(210, 170, 60, 0.22)",
    text: "#ffe2a3",
    accent: "#f4c96f",
    filter: "brightness(0) saturate(100%) invert(82%) sepia(33%) saturate(725%) hue-rotate(352deg) brightness(101%) contrast(92%)",
  },
  growth: {
    bg: "rgba(25, 64, 24, 0.54)",
    border: "rgba(104, 191, 88, 0.32)",
    iconBg: "rgba(90, 180, 80, 0.22)",
    text: "#cff7b7",
    accent: "#8bdc6f",
    filter: "brightness(0) saturate(100%) invert(75%) sepia(43%) saturate(605%) hue-rotate(54deg) brightness(95%) contrast(91%)",
  },
  network: {
    bg: "rgba(18, 45, 77, 0.58)",
    border: "rgba(83, 148, 220, 0.34)",
    iconBg: "rgba(70, 140, 220, 0.24)",
    text: "#cde8ff",
    accent: "#72b9f2",
    filter: "brightness(0) saturate(100%) invert(71%) sepia(46%) saturate(1094%) hue-rotate(177deg) brightness(98%) contrast(92%)",
  },
};

function toneForEvent(kind: TickHeadline["kind"]): EventTone {
  if (kind === "CRISIS_STARTED" || kind === "AGENT_DIED" || kind === "CRISIS_OVER") return TONES.danger!;
  if (kind === "AXL_MESSAGE") return TONES.network!;
  if (kind === "AGENT_SPAWNED" || kind === "CRISIS_RESOLVED") return TONES.growth!;
  return TONES.skill!;
}

export function TickTimeline() {
  const events = useStore((state) => state.events);
  const visible = recentEventHeadlines(events, 8);
  const [offsetPx, setOffsetPx] = useState(0);

  const timelineEntries = useMemo(
    () => (visible.length > 0 ? visible : [{ kind: "IDLE" as const, title: "Events will appear here as the world changes", actorId: "world" }]),
    [visible],
  );

  useEffect(() => {
    if (timelineEntries.length <= 1) return;
    let raf = 0;
    let previous = performance.now();
    const cardStep = 152;
    const resetAt = timelineEntries.length * cardStep;
    const speedPxPerSecond = 22;

    const animate = (now: number) => {
      const dt = Math.max(0, (now - previous) / 1000);
      previous = now;
      setOffsetPx((current) => {
        const next = current + dt * speedPxPerSecond;
        return next >= resetAt ? next - resetAt : next;
      });
      raf = window.requestAnimationFrame(animate);
    };

    raf = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(raf);
  }, [timelineEntries.length]);

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: 12,
        transform: "translateX(-50%)",
        width: "min(1040px, calc(100vw - 34px))",
        zIndex: 42,
        display: "flex",
        gap: 10,
        padding: 12,
        borderRadius: 14,
        background: "linear-gradient(180deg, rgba(28,22,15,0.80), rgba(15,12,10,0.78))",
        border: "1px solid rgba(231, 190, 110, 0.18)",
        boxShadow: "0 18px 48px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,235,180,0.08)",
        backdropFilter: "blur(12px)",
        pointerEvents: "none",
        fontFamily: F,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", gap: 10, transform: `translateX(-${offsetPx}px)` }}>
        {[...timelineEntries, ...timelineEntries].map((event, index) => {
        const isCurrent = index === visible.length - 1;
        const icon = event.kind === "IDLE" ? undefined : getEventIcon(event.kind);
        const tone = toneForEvent(event.kind);
        return (
          <motion.div
            layout
            key={`${event.kind}-${event.actorId}-${index}-${event.title}`}
            style={{
              width: 142,
              minHeight: 66,
              borderRadius: 11,
              padding: "9px 10px",
              background: isCurrent ? tone.bg : "rgba(0,0,0,0.24)",
              border: `1px solid ${isCurrent ? tone.border : "rgba(255,220,150,0.10)"}`,
              boxShadow: isCurrent ? `0 0 20px ${tone.border}` : "none",
            }}
          >
            <div style={{ color: isCurrent ? tone.accent : "#8d7b63", fontSize: 8, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>
              {isCurrent ? "Latest" : event.kind === "IDLE" ? "World" : event.kind.replace(/_/g, " ")}
            </div>
            <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center", background: tone.iconBg, border: `1px solid ${tone.border}`, flexShrink: 0 }}>
                {icon ? <img src={icon} alt="" width={22} height={22} style={{ filter: tone.filter }} /> : <span style={{ color: tone.accent, fontSize: 18 }}>•</span>}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: isCurrent ? tone.text : "#e4d1a8", fontSize: 11, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {event.title}
                </div>
                <div style={{ color: "#927c5f", fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 3 }}>
                  {event.actorId}
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}
      </div>
    </div>
  );
}
