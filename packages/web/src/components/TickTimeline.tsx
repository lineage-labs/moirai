import React from "react";
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

const KIND_EMOJI: Partial<Record<string, string>> = {
  CRISIS_STARTED: "🦁",
  AGENT_DIED: "💀",
  SKILL_ACCEPTED: "✨",
  SKILL_LEARNED: "🤝",
  SKILL_TAUGHT: "🤝",
  AGENT_SPAWNED: "🌱",
  CRISIS_RESOLVED: "✅",
  CRISIS_OVER: "🏁",
  AXL_MESSAGE: "📡",
  SKILL_INHERITED: "🧬",
  SKILL_REJECTED: "❌",
  IDLE: "🌍",
};

function emojiForEvent(kind: string): string {
  return KIND_EMOJI[kind] ?? "⚡";
}

export function TickTimeline() {
  const events = useStore((state) => state.events);
  const tick = useStore((state) => state.tick);

  const allRecent = recentEventHeadlines(events, 10);
  const pastEvents = allRecent.slice(0, -1).slice(-3);
  const currentEvent: TickHeadline = allRecent[allRecent.length - 1] ?? {
    kind: "IDLE",
    title: "World breathing",
    actorId: "world",
    tick,
  };
  const futureTicks = [1, 2, 3, 4];

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: 12,
        transform: "translateX(-50%)",
        width: "min(1080px, calc(100vw - 34px))",
        zIndex: 42,
        display: "flex",
        gap: 0,
        padding: "10px 14px",
        borderRadius: 14,
        background: "linear-gradient(180deg, rgba(28,22,15,0.82), rgba(15,12,10,0.80))",
        border: "1px solid rgba(231, 190, 110, 0.18)",
        boxShadow: "0 18px 48px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,235,180,0.08)",
        backdropFilter: "blur(12px)",
        pointerEvents: "none",
        fontFamily: F,
        alignItems: "center",
      }}
    >
      {/* EVENT LOG label */}
      <div style={{ flexShrink: 0, marginRight: 14, width: 68 }}>
        <div style={{ color: "#bda16f", fontSize: 8, fontWeight: 900, letterSpacing: 0.9, textTransform: "uppercase", marginBottom: 3 }}>
          Event
        </div>
        <div style={{ color: "#bda16f", fontSize: 8, fontWeight: 900, letterSpacing: 0.9, textTransform: "uppercase" }}>
          Log
        </div>
      </div>

      {/* Past event cards */}
      <div style={{ display: "flex", gap: 8, flex: 1, justifyContent: "flex-end", marginRight: 8 }}>
        {pastEvents.map((event, idx) => {
          const tone = toneForEvent(event.kind);
          const icon = event.kind === "IDLE" ? undefined : getEventIcon(event.kind);
          return (
            <div
              key={`past-${idx}`}
              style={{
                width: 152,
                minHeight: 76,
                borderRadius: 11,
                padding: "9px 11px",
                background: "rgba(0,0,0,0.22)",
                border: "1px solid rgba(255,220,150,0.10)",
                flexShrink: 0,
              }}
            >
              <div style={{ color: "#6d604d", fontSize: 8, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 5 }}>
                Tick {event.tick}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", display: "grid", placeItems: "center", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,220,150,0.12)", flexShrink: 0, fontSize: 18 }}>
                  {icon ? <img src={icon} alt="" width={22} height={22} style={{ filter: tone.filter, opacity: 0.7 }} /> : <span>{emojiForEvent(event.kind)}</span>}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "#a08872", fontSize: 11, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {event.title}
                  </div>
                  <div style={{ color: "#6d604d", fontSize: 9, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {event.actorId}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Current event card — centered, yellow outline */}
      {(() => {
        const tone = toneForEvent(currentEvent.kind);
        const icon = currentEvent.kind === "IDLE" ? undefined : getEventIcon(currentEvent.kind);
        return (
          <div
            style={{
              width: 172,
              minHeight: 86,
              borderRadius: 13,
              padding: "10px 13px",
              background: tone.bg,
              border: "2px solid #f6cf74",
              boxShadow: "0 0 24px rgba(246,207,116,0.28), 0 0 0 1px rgba(246,207,116,0.10)",
              flexShrink: 0,
              position: "relative",
            }}
          >
            <div style={{ color: "#f6cf74", fontSize: 9, fontWeight: 900, letterSpacing: 0.9, textTransform: "uppercase", marginBottom: 6 }}>
              EVT {currentEvent.tick || tick}
            </div>
            <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", display: "grid", placeItems: "center", background: tone.iconBg, border: `1px solid ${tone.border}`, flexShrink: 0, fontSize: 20 }}>
                {icon ? <img src={icon} alt="" width={26} height={26} style={{ filter: tone.filter }} /> : <span>{emojiForEvent(currentEvent.kind)}</span>}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: tone.text, fontSize: 12, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {currentEvent.title}
                </div>
                <div style={{ color: tone.accent, fontSize: 9, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {currentEvent.actorId}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Future placeholder tick cards */}
      <div style={{ display: "flex", gap: 8, flex: 1, marginLeft: 8 }}>
        {futureTicks.map((offset) => (
          <div
            key={`future-${offset}`}
            style={{
              width: 152,
              minHeight: 76,
              borderRadius: 11,
              padding: "9px 11px",
              background: "rgba(0,0,0,0.14)",
              border: "1px solid rgba(255,220,150,0.06)",
              flexShrink: 0,
              opacity: Math.max(0.25, 0.7 - offset * 0.15),
            }}
          >
            <div style={{ color: "#5a4e3e", fontSize: 8, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 5 }}>
              Tick (t+{offset})
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(0,0,0,0.22)", border: "1px solid rgba(255,220,150,0.07)", flexShrink: 0 }} />
              <div style={{ color: "#4a4035", fontSize: 11, fontWeight: 600 }}>—</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
