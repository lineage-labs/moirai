import React, { useState, useEffect, useRef } from "react";
import type { GameEvent } from "./store";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&display=swap');
.ep-row:hover { background: rgba(255,248,235,0.04); }
::-webkit-scrollbar { width: 3px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(200,170,120,0.2); border-radius: 4px; }
.react-flow, .react-flow__renderer, .react-flow__container { background: transparent !important; }
`;

const F = "'DM Sans', system-ui, sans-serif";

const KIND_COLOR: Partial<Record<string, string>> = {
  CRISIS_STARTED:    "#c8724a",  CRISIS_OVER:    "#b85848",  CRISIS_RESOLVED: "#78a860",
  REASONING_STARTED: "#b89040",  SKILL_PROPOSED: "#8aaa60",  SELF_EVAL_STARTED: "#a88840",
  SELF_EVAL_RESULT:  "#8aaa60",  SKILL_ACCEPTED: "#78a860",  SKILL_REJECTED:   "#b85848",
  SKILL_DECLINED:    "#a87040",  AXL_MESSAGE:    "#5888a8",  SKILL_TAUGHT:     "#6898b0",
  SKILL_LEARNED:     "#6898b0",  SKILL_INHERITED:"#4a9888",  AGENT_SPAWNED:    "#609878",
  AGENT_DIED:        "#b08838",
};

// These carry no meaningful dropdown content — rendered in muted tone, no expand chevron
const NEUTRAL_KINDS = new Set(["REASONING_STARTED", "SELF_EVAL_STARTED", "AGENT_RESCUED"]);

const KIND_ICON: Partial<Record<string, string>> = {
  CRISIS_STARTED: "⚠️",  AGENT_RESCUED: "🛡️", CRISIS_OVER: "⚔️",  CRISIS_RESOLVED: "🛡️",
  REASONING_STARTED: "🧠", SKILL_PROPOSED: "💡", SELF_EVAL_STARTED: "🔎",
  SELF_EVAL_RESULT: "📊",  SKILL_ACCEPTED: "✦",  SKILL_REJECTED: "✕",
  SKILL_DECLINED: "↩",     AXL_MESSAGE: "📡",    SKILL_TAUGHT: "↑",
  SKILL_LEARNED: "↓",      SKILL_INHERITED: "🧬", AGENT_SPAWNED: "🌱",
  AGENT_DIED: "☽",
};

function label(k: string) {
  return k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function shortHash(h: string) { return `${h.slice(0, 8)}…${h.slice(-6)}`; }

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 3, height: 5, overflow: "hidden", margin: "3px 0 6px" }}>
      <div style={{ width: `${Math.min(value, 1) * 100}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.4s" }} />
    </div>
  );
}

// ─── Expanded detail ──────────────────────────────────────────────────────────

function Detail({ ev }: { ev: GameEvent }) {
  const p = ev.payload ?? {};
  const color = KIND_COLOR[ev.kind] ?? "#8a7a60";

  const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "4px 0" }}>
      <span style={{ fontFamily: F, fontSize: 10, fontWeight: 600, letterSpacing: 0.8, color: "#a89878", minWidth: 88, flexShrink: 0, textTransform: "uppercase" as const }}>
        {k}
      </span>
      <span style={{ fontFamily: F, fontSize: 12, fontWeight: 400, color: "#c0b090", lineHeight: 1.4 }}>{children}</span>
    </div>
  );
  const Accent = ({ c, children }: { c: string; children: React.ReactNode }) => (
    <span style={{ color: c, fontWeight: 600 }}>{children}</span>
  );
  const Mono = ({ children }: { children: React.ReactNode }) => (
    <span style={{ fontFamily: "monospace", fontSize: 10, color: "#9a8e7c", wordBreak: "break-all" as const }}>{children}</span>
  );

  const rows: React.ReactNode[] = [];

  if (ev.receiptHash)
    rows.push(<Row key="rh" k="Receipt"><Mono>{shortHash(ev.receiptHash)}</Mono></Row>);

  switch (ev.kind) {
    case "CRISIS_STARTED": {
      const c = p as { id?: string; type?: string; targets?: string[]; location?: string };
      if (c.type)            rows.push(<Row key="t"  k="Type"><Accent c="#d4804a">{c.type}</Accent></Row>);
      if (c.targets?.length) rows.push(<Row key="tg" k="Targets">{c.targets.join(", ")}</Row>);
      if (c.location)        rows.push(<Row key="lo" k="Location">{c.location}</Row>);
      if (c.id)              rows.push(<Row key="id" k="Crisis ID"><Mono>{c.id}</Mono></Row>);
      break;
    }
    case "CRISIS_OVER": {
      const o = p as { survived?: string[]; killed?: string[] };
      if (o.survived?.length) rows.push(<Row key="s" k="Survived"><Accent c="#7db86a">{o.survived.join(", ")}</Accent></Row>);
      if (o.killed?.length)   rows.push(<Row key="k" k="Killed"><Accent c="#c85840">{o.killed.join(", ")}</Accent></Row>);
      break;
    }
    case "AGENT_DIED": { const d = p as { reason?: string }; if (d.reason) rows.push(<Row key="r" k="Cause"><Accent c="#c09040">{d.reason}</Accent></Row>); break; }
    case "AGENT_SPAWNED": {
      const s = p as { personalityId?: string; traits?: string[] };
      if (s.traits?.length) rows.push(<Row key="tr" k="Traits">{s.traits.join(" · ")}</Row>);
      else if (s.personalityId) rows.push(<Row key="p" k="Identity">{s.personalityId}</Row>);
      break;
    }
    case "CRISIS_RESOLVED": {
      const r = p as { survived?: string[]; died?: string[]; totalAlive?: number };
      if (r.survived?.length) rows.push(<Row key="sv" k="Survived"><Accent c="#78a860">{r.survived.join(", ")}</Accent></Row>);
      if (r.died?.length)     rows.push(<Row key="dy" k="Died"><Accent c="#b85848">{r.died.join(", ")}</Accent></Row>);
      if (r.totalAlive != null) rows.push(<Row key="al" k="Total alive">{String(r.totalAlive)} agents</Row>);
      break;
    }
    case "REASONING_STARTED": { /* crisis ID shown inline */ break; }
    case "SELF_EVAL_STARTED":  { /* neutral — no dropdown */ break; }
    case "SKILL_PROPOSED": {
      const sk = (p as { candidate?: { name?: string; effect?: string; steps?: string[] } }).candidate ?? {};
      if (sk.name)          rows.push(<Row key="n"  k="Skill"><Accent c="#98c070">{sk.name}</Accent></Row>);
      if (sk.effect)        rows.push(<Row key="e"  k="Effect">{sk.effect}</Row>);
      if (sk.steps?.length) rows.push(<Row key="st" k="Steps"><div>{sk.steps.map((s, i) => <div key={i} style={{ marginBottom: 2 }}>{i + 1}. {s}</div>)}</div></Row>);
      break;
    }
    case "SELF_EVAL_RESULT": {
      const r = p as { score?: number; failureModes?: string[] };
      if (r.score != null) {
        const sc = r.score >= 0.6 ? "#7db86a" : r.score >= 0.4 ? "#c09040" : "#c05848";
        rows.push(<Row key="sc" k="Score"><Accent c={sc}>{r.score.toFixed(2)}</Accent></Row>);
        rows.push(<Bar key="bar" value={r.score} color={sc} />);
      }
      if (r.failureModes?.length)
        rows.push(<Row key="fm" k="Risks"><div>{r.failureModes.map((f, i) => <div key={i} style={{ color: "#b87848", marginBottom: 2 }}>· {f}</div>)}</div></Row>);
      break;
    }
    case "SKILL_ACCEPTED": {
      const sk = (p as { skill?: { name?: string; id?: string; provenance?: { reasonReceipt?: string; selfEvalReceipt?: string; selfEvalScore?: number } } }).skill ?? {};
      const pv = sk.provenance ?? {};
      if (sk.name) rows.push(<Row key="n" k="Skill"><Accent c="#7db86a">{sk.name}</Accent></Row>);
      if (pv.selfEvalScore != null) {
        rows.push(<Row key="sc" k="Eval Score"><Accent c="#7db86a">{pv.selfEvalScore.toFixed(2)}</Accent></Row>);
        rows.push(<Bar key="bar" value={pv.selfEvalScore} color="#7db86a" />);
      }
      if (pv.reasonReceipt)   rows.push(<Row key="rr" k="Reason Hash"><Mono>{shortHash(pv.reasonReceipt)}</Mono></Row>);
      if (pv.selfEvalReceipt) rows.push(<Row key="er" k="Eval Hash"><Mono>{shortHash(pv.selfEvalReceipt)}</Mono></Row>);
      if (sk.id)              rows.push(<Row key="id" k="Skill ID"><Mono>{sk.id}</Mono></Row>);
      break;
    }
    case "SKILL_REJECTED": {
      const r = p as { reason?: string; score?: number };
      if (r.score != null) { rows.push(<Row key="sc" k="Score"><Accent c="#c05848">{r.score.toFixed(2)}</Accent></Row>); rows.push(<Bar key="bar" value={r.score} color="#c05848" />); }
      if (r.reason) rows.push(<Row key="r" k="Reason"><Accent c="#c05848">{r.reason}</Accent></Row>);
      break;
    }
    case "SKILL_DECLINED": {
      const d = p as { skillName?: string; skillEffect?: string; score?: number; reason?: string };
      if (d.skillName)   rows.push(<Row key="n" k="Skill">{d.skillName}</Row>);
      if (d.skillEffect) rows.push(<Row key="e" k="Effect">{d.skillEffect}</Row>);
      if (d.score != null) { rows.push(<Row key="sc" k="Score"><Accent c="#b87848">{d.score.toFixed(2)}</Accent></Row>); rows.push(<Bar key="bar" value={d.score} color="#b87848" />); }
      if (d.reason) rows.push(<Row key="r" k="Reason"><Accent c="#b87848">{d.reason}</Accent></Row>);
      break;
    }
    case "AXL_MESSAGE": {
      const m = p as { from?: string; to?: string; kind?: string; body?: unknown };
      if (m.from && m.to) rows.push(<Row key="rt" k="Route"><Accent c="#6898b8">{m.from} → {m.to}</Accent></Row>);
      if (m.kind)         rows.push(<Row key="k"  k="Msg Kind">{m.kind}</Row>);
      if (m.body)         rows.push(<Row key="b"  k="Body"><Mono>{JSON.stringify(m.body).slice(0, 80)}</Mono></Row>);
      break;
    }
    case "SKILL_LEARNED": case "SKILL_TAUGHT": {
      const l = p as { from?: string; to?: string; skillId?: string };
      const who = ev.kind === "SKILL_LEARNED" ? l.from : l.to;
      if (who)       rows.push(<Row key="w" k={ev.kind === "SKILL_LEARNED" ? "Learned From" : "Taught To"}><Accent c="#7aacc0">{who}</Accent></Row>);
      if (l.skillId) rows.push(<Row key="s" k="Skill ID"><Mono>{l.skillId}</Mono></Row>);
      break;
    }
    case "SKILL_INHERITED": {
      const i = p as { skillId?: string };
      if (i.skillId) rows.push(<Row key="s" k="Skill ID"><Mono>{i.skillId}</Mono></Row>);
      break;
    }
  }

  if (!rows.length) return null;
  return (
    <div style={{
      margin: "8px 0 4px",
      padding: "10px 14px",
      background: "rgba(0,0,0,0.22)",
      borderLeft: `3px solid ${color}`,
      borderRadius: "0 8px 8px 0",
    }}>
      {rows}
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function EventPanel({ events, style, onHide }: { events: GameEvent[]; style?: React.CSSProperties; onHide?: () => void }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (document.getElementById("ep-css")) return;
    const el = document.createElement("style");
    el.id = "ep-css";
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);

  const visible = events.filter(e => e.kind !== "WORLD_TICK" && e.kind !== "AGENT_HUNGER");

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible.length]);

  const toggle = (idx: number) =>
    setExpanded(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });

  const glassStyle: React.CSSProperties = {
    background: "rgba(18, 16, 14, 0.52)",
    border: "1px solid rgba(255,255,255,0.13)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.35), 0 4px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.09)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", fontFamily: F, borderRadius: 8, overflow: "hidden", ...glassStyle, ...style }}>

      {/* Header */}
      <div style={{ padding: "13px 18px 11px", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ color: "#ece6d8", fontSize: 13, fontWeight: 500, letterSpacing: 0.4 }}>Event Log</div>
          <div style={{ color: "#8a8070", fontSize: 10, marginTop: 2 }}>Agent actions, crises &amp; skill evolution</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {visible.length > 0 && (
            <span style={{ color: "#7a7060", fontSize: 10 }}>{visible.length}</span>
          )}
          {onHide && (
            <button onClick={onHide} style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: "#6a6050", fontSize: 14, padding: "0 2px", lineHeight: 1,
            }}>✕</button>
          )}
        </div>
      </div>

      {/* Event rows — oldest at top, newest appended at bottom */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "4px 0 8px" }}>
        {visible.length === 0 && (
          <div style={{ color: "#6a6050", fontSize: 11, textAlign: "center", marginTop: 24 }}>Awaiting signals…</div>
        )}

        {visible.map((ev, i) => {
          const isNeutral = NEUTRAL_KINDS.has(ev.kind);
          const color = isNeutral ? "#6a6258" : (KIND_COLOR[ev.kind] ?? "#7a6a54");
          const icon  = KIND_ICON[ev.kind] ?? "·";
          const isOpen = expanded.has(i);
          const crisisId = (ev.payload as { crisisId?: string })?.crisisId;
          const skillUsed = (ev.payload as { skillUsed?: string })?.skillUsed;

          return (
            <div key={i} className="ep-row" onClick={() => !isNeutral && toggle(i)} style={{ cursor: isNeutral ? "default" : "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 18px" }}>
                <span style={{ fontSize: 13, width: 18, textAlign: "center", flexShrink: 0 }}>{icon}</span>
                <span style={{ color, fontSize: 13, fontWeight: 400, flex: 1 }}>
                  {label(ev.kind)}
                  {crisisId && <span style={{ color: "#9a8e7a", fontSize: 11, marginLeft: 6 }}>{crisisId}</span>}
                  {skillUsed && <span style={{ color: "#90b070", fontSize: 11, marginLeft: 6 }}>via {skillUsed}</span>}
                </span>
                <span style={{ color: "#8a8070", fontSize: 11 }}>{ev.actorId}</span>
                <span style={{ color: "#5a5448", fontSize: 11, minWidth: 28, textAlign: "right" }}>t{ev.tick}</span>
                {!isNeutral && <span style={{ color: "#5a5448", fontSize: 9 }}>{isOpen ? "▲" : "▼"}</span>}
              </div>

              {isOpen && (
                <div style={{ padding: "0 18px 6px 44px" }}>
                  <Detail ev={ev} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
