import React, { useState, useRef, useEffect } from "react";
import { getEventIcon } from "../eventIcons";
import { MEANINGFUL_EVENT_KINDS } from "../timeline";
import { useStore, type GameEvent } from "../store";

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
    bg: "rgba(76, 19, 15, 0.82)",
    border: "rgba(239, 92, 69, 0.46)",
    iconBg: "rgba(210, 55, 40, 0.28)",
    text: "#ffd0c4",
    accent: "#ff7967",
    filter: "brightness(0) saturate(100%) invert(61%) sepia(48%) saturate(2794%) hue-rotate(326deg) brightness(104%) contrast(101%)",
  },
  skill: {
    bg: "rgba(75, 56, 16, 0.78)",
    border: "rgba(225, 178, 73, 0.44)",
    iconBg: "rgba(210, 170, 60, 0.26)",
    text: "#ffe2a3",
    accent: "#f4c96f",
    filter: "brightness(0) saturate(100%) invert(82%) sepia(33%) saturate(725%) hue-rotate(352deg) brightness(101%) contrast(92%)",
  },
  growth: {
    bg: "rgba(25, 64, 24, 0.74)",
    border: "rgba(104, 191, 88, 0.42)",
    iconBg: "rgba(90, 180, 80, 0.26)",
    text: "#cff7b7",
    accent: "#8bdc6f",
    filter: "brightness(0) saturate(100%) invert(75%) sepia(43%) saturate(605%) hue-rotate(54deg) brightness(95%) contrast(91%)",
  },
  network: {
    bg: "rgba(18, 45, 77, 0.78)",
    border: "rgba(83, 148, 220, 0.44)",
    iconBg: "rgba(70, 140, 220, 0.28)",
    text: "#cde8ff",
    accent: "#72b9f2",
    filter: "brightness(0) saturate(100%) invert(71%) sepia(46%) saturate(1094%) hue-rotate(177deg) brightness(98%) contrast(92%)",
  },
};

function toneForEvent(kind: string): EventTone {
  if (kind === "CRISIS_STARTED" || kind === "AGENT_DIED" || kind === "CRISIS_OVER") return TONES.danger!;
  if (kind === "AXL_MESSAGE") return TONES.network!;
  if (kind === "AGENT_SPAWNED" || kind === "CRISIS_RESOLVED") return TONES.growth!;
  return TONES.skill!;
}

const KIND_EMOJI: Partial<Record<string, string>> = {
  CRISIS_STARTED: "🦁",
  AGENT_DIED: "💀",
  SKILL_ACCEPTED: "✨",
  SKILL_PROPOSED: "💡",
  SELF_EVAL_RESULT: "📊",
  SKILL_REJECTED: "❌",
  SKILL_DECLINED: "🚫",
  SKILL_LEARNED: "🤝",
  SKILL_TAUGHT: "🤝",
  SKILL_INHERITED: "🧬",
  AGENT_SPAWNED: "🌱",
  CRISIS_RESOLVED: "✅",
  CRISIS_OVER: "🏁",
  AXL_MESSAGE: "📡",
};

function emojiFor(kind: string) { return KIND_EMOJI[kind] ?? "⚡"; }

function shortHash(h: string) { return `${h.slice(0, 8)}…${h.slice(-6)}`; }
function kindLabel(k: string) { return k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }

// ─── Detail popup ──────────────────────────────────────────────────────────

function DetailRow({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 6 }}>
      <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: 0.8, color: "#b99b6f", minWidth: 90, flexShrink: 0, textTransform: "uppercase", paddingTop: 2 }}>
        {label}
      </span>
      <span style={{ fontSize: mono ? 10 : 11, fontFamily: mono ? "monospace" : F, color: mono ? "#a99578" : "#d2c2a4", wordBreak: "break-all", lineHeight: 1.45 }}>
        {children}
      </span>
    </div>
  );
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 3, height: 4, overflow: "hidden", margin: "3px 0 6px" }}>
      <div style={{ width: `${Math.min(value, 1) * 100}%`, height: "100%", background: color, borderRadius: 3 }} />
    </div>
  );
}

function EventDetailPopup({ event, onClose }: { event: GameEvent; onClose: () => void }) {
  const tone = toneForEvent(event.kind);
  const icon = getEventIcon(event.kind);
  const p = event.payload ?? {};

  const rows: React.ReactNode[] = [];

  if (event.receiptHash)
    rows.push(<DetailRow key="rh" label="0G Receipt" mono>{shortHash(event.receiptHash)}</DetailRow>);

  switch (event.kind) {
    case "CRISIS_STARTED": {
      const c = p as { id?: string; type?: string; targets?: string[]; location?: string };
      if (c.type)             rows.push(<DetailRow key="t"  label="Type"><span style={{ color: "#e08854", fontWeight: 700 }}>{c.type}</span></DetailRow>);
      if (c.targets?.length)  rows.push(<DetailRow key="tg" label="Targets">{c.targets.join(", ")}</DetailRow>);
      if (c.location)         rows.push(<DetailRow key="lo" label="Location">{c.location}</DetailRow>);
      if (c.id)               rows.push(<DetailRow key="id" label="Crisis ID" mono>{c.id}</DetailRow>);
      break;
    }
    case "CRISIS_OVER": {
      const o = p as { survived?: string[]; killed?: string[] };
      if (o.survived?.length) rows.push(<DetailRow key="s" label="Survived"><span style={{ color: "#8dae6b" }}>{o.survived.join(", ")}</span></DetailRow>);
      if (o.killed?.length)   rows.push(<DetailRow key="k" label="Killed"><span style={{ color: "#bf6f56" }}>{o.killed.join(", ")}</span></DetailRow>);
      break;
    }
    case "AGENT_DIED": {
      const d = p as { reason?: string };
      if (d.reason) rows.push(<DetailRow key="r" label="Cause"><span style={{ color: "#c09848" }}>{d.reason}</span></DetailRow>);
      break;
    }
    case "AGENT_SPAWNED": {
      const s = p as { personalityId?: string; traits?: string[] };
      if (s.traits?.length)   rows.push(<DetailRow key="tr" label="Traits">{s.traits.join(" · ")}</DetailRow>);
      else if (s.personalityId) rows.push(<DetailRow key="p" label="Identity">{s.personalityId}</DetailRow>);
      break;
    }
    case "CRISIS_RESOLVED": {
      const r = p as { survived?: string[]; died?: string[]; totalAlive?: number };
      if (r.survived?.length)  rows.push(<DetailRow key="sv" label="Survived"><span style={{ color: "#8dae6b" }}>{r.survived.join(", ")}</span></DetailRow>);
      if (r.died?.length)      rows.push(<DetailRow key="dy" label="Died"><span style={{ color: "#bf6f56" }}>{r.died.join(", ")}</span></DetailRow>);
      if (r.totalAlive != null) rows.push(<DetailRow key="al" label="Total Alive">{String(r.totalAlive)} agents</DetailRow>);
      break;
    }
    case "SKILL_PROPOSED": {
      const sk = (p as { candidate?: { name?: string; effect?: string; steps?: string[] } }).candidate ?? {};
      if (sk.name)          rows.push(<DetailRow key="n" label="Skill"><span style={{ color: "#a9b86c", fontWeight: 700 }}>{sk.name}</span></DetailRow>);
      if (sk.effect)        rows.push(<DetailRow key="e" label="Effect">{sk.effect}</DetailRow>);
      if (sk.steps?.length) rows.push(<DetailRow key="st" label="Steps"><div style={{ lineHeight: 1.6 }}>{sk.steps.map((s, i) => <div key={i}>{i + 1}. {s}</div>)}</div></DetailRow>);
      break;
    }
    case "SELF_EVAL_RESULT": {
      const r = p as { score?: number; failureModes?: string[] };
      if (r.score != null) {
        const sc = r.score >= 0.6 ? "#8dae6b" : r.score >= 0.4 ? "#c59b5c" : "#bf6f56";
        rows.push(<DetailRow key="sc" label="Eval Score"><span style={{ color: sc, fontWeight: 700 }}>{r.score.toFixed(2)}</span></DetailRow>);
        rows.push(<ScoreBar key="bar" value={r.score} color={sc} />);
      }
      if (r.failureModes?.length)
        rows.push(<DetailRow key="fm" label="Risks"><div style={{ lineHeight: 1.6 }}>{r.failureModes.map((f, i) => <div key={i} style={{ color: "#be8b55" }}>· {f}</div>)}</div></DetailRow>);
      break;
    }
    case "SKILL_ACCEPTED": {
      const sk = (p as { skill?: { name?: string; id?: string; provenance?: { reasonReceipt?: string; selfEvalReceipt?: string; selfEvalScore?: number } } }).skill ?? {};
      const pv = sk.provenance ?? {};
      if (sk.name) rows.push(<DetailRow key="n" label="Skill"><span style={{ color: "#8dae6b", fontWeight: 700 }}>{sk.name}</span></DetailRow>);
      if (pv.selfEvalScore != null) {
        rows.push(<DetailRow key="sc" label="Eval Score"><span style={{ color: "#8dae6b", fontWeight: 700 }}>{pv.selfEvalScore.toFixed(2)}</span></DetailRow>);
        rows.push(<ScoreBar key="bar" value={pv.selfEvalScore} color="#8dae6b" />);
      }
      if (pv.reasonReceipt)   rows.push(<DetailRow key="rr" label="Reason Hash" mono>{shortHash(pv.reasonReceipt)}</DetailRow>);
      if (pv.selfEvalReceipt) rows.push(<DetailRow key="er" label="Eval Hash" mono>{shortHash(pv.selfEvalReceipt)}</DetailRow>);
      if (sk.id)              rows.push(<DetailRow key="id" label="Skill ID" mono>{sk.id.slice(0, 20)}</DetailRow>);
      break;
    }
    case "SKILL_REJECTED": {
      const r = p as { reason?: string; score?: number };
      if (r.score != null) { rows.push(<DetailRow key="sc" label="Score"><span style={{ color: "#bf6f56", fontWeight: 700 }}>{r.score.toFixed(2)}</span></DetailRow>); rows.push(<ScoreBar key="bar" value={r.score} color="#bf6f56" />); }
      if (r.reason) rows.push(<DetailRow key="r" label="Reason"><span style={{ color: "#bf6f56" }}>{r.reason}</span></DetailRow>);
      break;
    }
    case "AXL_MESSAGE": {
      const m = p as { from?: string; to?: string; kind?: string; body?: unknown };
      if (m.from && m.to) rows.push(<DetailRow key="rt" label="Route"><span style={{ color: "#83aaba" }}>{m.from} → {m.to}</span></DetailRow>);
      if (m.kind)         rows.push(<DetailRow key="k"  label="Msg Kind">{m.kind}</DetailRow>);
      if (m.body)         rows.push(<DetailRow key="b"  label="Body" mono>{JSON.stringify(m.body).slice(0, 120)}</DetailRow>);
      break;
    }
    case "SKILL_LEARNED":
    case "SKILL_TAUGHT": {
      const l = p as { from?: string; to?: string; skillId?: string };
      const who = event.kind === "SKILL_LEARNED" ? l.from : l.to;
      if (who)       rows.push(<DetailRow key="w" label={event.kind === "SKILL_LEARNED" ? "Learned From" : "Taught To"}><span style={{ color: "#83aaba" }}>{who}</span></DetailRow>);
      if (l.skillId) rows.push(<DetailRow key="s" label="Skill ID" mono>{l.skillId.slice(0, 20)}</DetailRow>);
      break;
    }
    case "SKILL_INHERITED": {
      const i = p as { skillId?: string };
      if (i.skillId) rows.push(<DetailRow key="s" label="Skill ID" mono>{i.skillId.slice(0, 20)}</DetailRow>);
      break;
    }
  }

  const hasContent = rows.length > 0;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 112,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 55,
        width: 480,
        maxHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        borderRadius: 12,
        background: "linear-gradient(180deg, rgba(26,20,13,0.97), rgba(14,11,8,0.95))",
        border: `1px solid ${tone.border}`,
        boxShadow: `0 0 0 1px rgba(0,0,0,0.5), 0 24px 56px rgba(0,0,0,0.58), 0 0 28px ${tone.border}`,
        backdropFilter: "blur(18px)",
        fontFamily: F,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ padding: "12px 14px 10px", borderBottom: `1px solid ${tone.border}`, background: tone.bg, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", display: "grid", placeItems: "center", background: tone.iconBg, border: `1px solid ${tone.border}`, flexShrink: 0, fontSize: 18 }}>
          {icon ? <img src={icon} alt="" width={22} height={22} style={{ filter: tone.filter }} /> : <span>{emojiFor(event.kind)}</span>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: tone.text, fontSize: 12, fontWeight: 900 }}>{kindLabel(event.kind)}</div>
          <div style={{ color: tone.accent, fontSize: 9, marginTop: 2 }}>
            Tick {event.tick} · {event.actorId}
            {event.receiptHash && <span style={{ marginLeft: 6, color: "#7ea88a", fontWeight: 700 }}>⛓ on-chain</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ background: "transparent", border: "none", color: "#9f8968", cursor: "pointer", fontSize: 16, padding: "2px 4px", lineHeight: 1 }}
        >×</button>
      </div>

      {/* Rows — scrollable */}
      {hasContent ? (
        <div style={{ padding: "12px 14px 14px", overflowY: "auto", flex: 1, scrollbarWidth: "thin", scrollbarColor: "rgba(196,151,84,0.22) transparent" }}>
          {rows}
        </div>
      ) : (
        <div style={{ padding: "14px", color: "#7a6a54", fontSize: 11 }}>No additional details for this event.</div>
      )}
    </div>
  );
}

// ─── Timeline ──────────────────────────────────────────────────────────────

export function TickTimeline() {
  const events = useStore((s) => s.events);
  const tick = useStore((s) => s.tick);
  const [selectedEvent, setSelectedEvent] = useState<GameEvent | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const meaningfulEvents = events.filter((e) => MEANINGFUL_EVENT_KINDS.has(e.kind));

  // Auto-scroll to the newest event — but not while a card detail is open
  useEffect(() => {
    if (selectedEvent) return;
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [meaningfulEvents.length, selectedEvent]);

  // Close detail when clicking outside
  useEffect(() => {
    if (!selectedEvent) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest("[data-timeline]")) setSelectedEvent(null);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [selectedEvent]);

  const handleCardClick = (ev: GameEvent) => {
    setSelectedEvent((prev) => (prev === ev ? null : ev));
  };

  return (
    <div data-timeline style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 42 }}>
      {selectedEvent && (
        <EventDetailPopup event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}

      <div
        style={{
          margin: "0 14px 12px",
          borderRadius: 14,
          background: "linear-gradient(180deg, rgba(28,22,15,0.84), rgba(15,12,10,0.82))",
          border: "1px solid rgba(231, 190, 110, 0.18)",
          boxShadow: "0 18px 48px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,235,180,0.08)",
          backdropFilter: "blur(12px)",
          fontFamily: F,
          display: "flex",
          alignItems: "center",
          padding: "10px 14px",
          gap: 12,
        }}
      >
        {/* Label */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ color: "#bda16f", fontSize: 8, fontWeight: 900, letterSpacing: 0.9, textTransform: "uppercase", marginBottom: 2 }}>Event</div>
          <div style={{ color: "#bda16f", fontSize: 8, fontWeight: 900, letterSpacing: 0.9, textTransform: "uppercase" }}>Log</div>
        </div>

        {/* Scrollable cards */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            display: "flex",
            gap: 8,
            overflowX: "auto",
            paddingBottom: 2,
            scrollbarWidth: "none",
          }}
        >
          <style>{`[data-timeline] div::-webkit-scrollbar { display: none; }`}</style>

          {meaningfulEvents.length === 0 && (
            <div style={{ color: "#5a4e3e", fontSize: 11, alignSelf: "center", padding: "0 8px" }}>
              Events will appear here…
            </div>
          )}

          {meaningfulEvents.map((event, idx) => {
            const isCurrent = event.tick === tick;
            const isSelected = selectedEvent === event;
            const tone = toneForEvent(event.kind);
            const icon = getEventIcon(event.kind);
            const hasReceipt = !!event.receiptHash;

            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleCardClick(event)}
                style={{
                  flexShrink: 0,
                  width: 190,
                  minHeight: 76,
                  borderRadius: 11,
                  padding: "9px 12px",
                  background: isCurrent ? tone.bg : isSelected ? "rgba(255,220,150,0.06)" : "rgba(0,0,0,0.22)",
                  border: isCurrent
                    ? `2px solid #f6cf74`
                    : isSelected
                    ? `1px solid rgba(246,207,116,0.4)`
                    : "1px solid rgba(255,220,150,0.10)",
                  boxShadow: isCurrent ? "0 0 20px rgba(246,207,116,0.22)" : "none",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: F,
                  transition: "background 0.15s, border 0.15s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <span style={{ color: isCurrent ? "#f6cf74" : "#5a4e3e", fontSize: 8, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase" }}>
                    Tick {event.tick}
                  </span>
                  {hasReceipt && (
                    <span style={{ fontSize: 8, color: "#7ea88a", fontWeight: 700 }}>⛓</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: "50%",
                    display: "grid", placeItems: "center",
                    background: isCurrent ? tone.iconBg : "rgba(0,0,0,0.28)",
                    border: `1px solid ${isCurrent ? tone.border : "rgba(255,220,150,0.12)"}`,
                    flexShrink: 0, fontSize: 17,
                  }}>
                    {icon
                      ? <img src={icon} alt="" width={21} height={21} style={{ filter: tone.filter, opacity: isCurrent ? 1 : 0.65 }} />
                      : <span>{emojiFor(event.kind)}</span>}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: isCurrent ? tone.text : "#a08872", fontSize: 11, fontWeight: 700, lineHeight: 1.25 }}>
                      {kindLabel(event.kind)}
                    </div>
                    <div style={{ color: isCurrent ? tone.accent : "#5a4e3e", fontSize: 9, marginTop: 3 }}>
                      {event.actorId}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
