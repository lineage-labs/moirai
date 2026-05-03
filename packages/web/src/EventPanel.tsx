import React, { useState, useEffect, useRef } from "react";
import type { GameEvent } from "./store";
import { getEventIcon } from "./eventIcons";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap');
.ep-row { transition: background 0.15s ease; }
.ep-row:hover { background: rgba(244,214,154,0.055); }
.ep-scroll::-webkit-scrollbar { width: 4px; }
.ep-scroll::-webkit-scrollbar-track { background: transparent; }
.ep-scroll::-webkit-scrollbar-thumb { background: rgba(196,151,84,0.22); border-radius: 4px; }
.ep-scroll::-webkit-scrollbar-thumb:hover { background: rgba(196,151,84,0.40); }
.react-flow, .react-flow__renderer, .react-flow__container { background: transparent !important; }
`;

const F = "'DM Sans', system-ui, sans-serif";

const KIND_COLOR: Partial<Record<string, string>> = {
  CRISIS_STARTED:    "#d58a55",
  CRISIS_OVER:       "#bf6f56",
  CRISIS_RESOLVED:   "#8dae6b",
  REASONING_STARTED: "#c9a461",
  SKILL_PROPOSED:    "#a9b86c",
  SELF_EVAL_STARTED: "#c0a05e",
  SELF_EVAL_RESULT:  "#a9b86c",
  SKILL_ACCEPTED:    "#8dae6b",
  SKILL_REJECTED:    "#bf6f56",
  SKILL_DECLINED:    "#be8b55",
  AXL_MESSAGE:       "#7ea6b8",
  SKILL_TAUGHT:      "#83aaba",
  SKILL_LEARNED:     "#83aaba",
  SKILL_INHERITED:   "#80b39f",
  AGENT_SPAWNED:     "#8ead77",
  AGENT_DIED:        "#c59b5c",
  AGENT_RESCUED:     "#8dae6b",
};

const NEUTRAL_KINDS = new Set(["REASONING_STARTED", "SELF_EVAL_STARTED"]);

function label(k: string) {
  return k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function shortHash(h: string) { return `${h.slice(0, 8)}…${h.slice(-6)}`; }

function EventIcon({ kind }: { kind: string }) {
  const src = getEventIcon(kind);
  if (!src) {
    return <span style={{ fontSize: 11, color: "#8a765c", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>·</span>;
  }
  const color = KIND_COLOR[kind] ?? "#8a7a60";
  return (
    <div style={{
      width: 22,
      height: 22,
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 5,
      background: "rgba(242, 205, 145, 0.10)",
      border: `1px solid ${color}45`,
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
    }}>
      <img
        src={src}
        alt=""
        style={{
          width: 14,
          height: 14,
          filter: "brightness(0) saturate(100%) invert(77%) sepia(24%) saturate(529%) hue-rotate(351deg) brightness(91%) contrast(88%)",
          opacity: 0.9,
        }}
      />
    </div>
  );
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 3, height: 4, overflow: "hidden", margin: "4px 0 6px" }}>
      <div style={{ width: `${Math.min(value, 1) * 100}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.4s ease" }} />
    </div>
  );
}

function Detail({ ev }: { ev: GameEvent }) {
  const p = ev.payload ?? {};
  const color = KIND_COLOR[ev.kind] ?? "#8a7a60";

  const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "4px 0" }}>
      <span style={{ fontFamily: F, fontSize: 9, fontWeight: 600, letterSpacing: 0.8, color: "#b99b6f", minWidth: 84, flexShrink: 0, textTransform: "uppercase" as const }}>
        {k}
      </span>
      <span style={{ fontFamily: F, fontSize: 11.5, fontWeight: 400, color: "#d2c2a4", lineHeight: 1.4 }}>{children}</span>
    </div>
  );
  const Accent = ({ c, children }: { c: string; children: React.ReactNode }) => (
    <span style={{ color: c, fontWeight: 600 }}>{children}</span>
  );
  const Mono = ({ children }: { children: React.ReactNode }) => (
    <span style={{ fontFamily: "monospace", fontSize: 10, color: "#a99578", wordBreak: "break-all" as const }}>{children}</span>
  );

  const rows: React.ReactNode[] = [];

  if (ev.receiptHash)
    rows.push(<Row key="rh" k="Receipt"><Mono>{shortHash(ev.receiptHash)}</Mono></Row>);

  switch (ev.kind) {
    case "CRISIS_STARTED": {
      const c = p as { id?: string; type?: string; targets?: string[]; location?: string };
      if (c.type)            rows.push(<Row key="t"  k="Type"><Accent c="#e08854">{c.type}</Accent></Row>);
      if (c.targets?.length) rows.push(<Row key="tg" k="Targets">{c.targets.join(", ")}</Row>);
      if (c.location)        rows.push(<Row key="lo" k="Location">{c.location}</Row>);
      if (c.id)              rows.push(<Row key="id" k="Crisis ID"><Mono>{c.id}</Mono></Row>);
      break;
    }
    case "CRISIS_OVER": {
      const o = p as { survived?: string[]; killed?: string[] };
      if (o.survived?.length) rows.push(<Row key="s" k="Survived"><Accent c="#8dae6b">{o.survived.join(", ")}</Accent></Row>);
      if (o.killed?.length)   rows.push(<Row key="k" k="Killed"><Accent c="#bf6f56">{o.killed.join(", ")}</Accent></Row>);
      break;
    }
    case "AGENT_DIED": { const d = p as { reason?: string }; if (d.reason) rows.push(<Row key="r" k="Cause"><Accent c="#c09848">{d.reason}</Accent></Row>); break; }
    case "AGENT_SPAWNED": {
      const s = p as { personalityId?: string; traits?: string[] };
      if (s.traits?.length) rows.push(<Row key="tr" k="Traits">{s.traits.join(" · ")}</Row>);
      else if (s.personalityId) rows.push(<Row key="p" k="Identity">{s.personalityId}</Row>);
      break;
    }
    case "CRISIS_RESOLVED": {
      const r = p as { survived?: string[]; died?: string[]; totalAlive?: number };
      if (r.survived?.length) rows.push(<Row key="sv" k="Survived"><Accent c="#8dae6b">{r.survived.join(", ")}</Accent></Row>);
      if (r.died?.length)     rows.push(<Row key="dy" k="Died"><Accent c="#bf6f56">{r.died.join(", ")}</Accent></Row>);
      if (r.totalAlive != null) rows.push(<Row key="al" k="Total alive">{String(r.totalAlive)} agents</Row>);
      break;
    }
    case "REASONING_STARTED": break;
    case "SELF_EVAL_STARTED": break;
    case "AGENT_RESCUED": {
      const r = p as { crisisId?: string; crisisType?: string; skillUsed?: string };
      if (r.crisisType) rows.push(<Row key="t" k="Crisis"><Accent c="#d58a55">{r.crisisType}</Accent></Row>);
      if (r.skillUsed)  rows.push(<Row key="s" k="Skill Used"><Accent c="#8dae6b">{r.skillUsed}</Accent></Row>);
      break;
    }
    case "SKILL_PROPOSED": {
      const sk = (p as { candidate?: { name?: string; effect?: string; steps?: string[] } }).candidate ?? {};
      if (sk.name)          rows.push(<Row key="n"  k="Skill"><Accent c="#a9b86c">{sk.name}</Accent></Row>);
      if (sk.effect)        rows.push(<Row key="e"  k="Effect">{sk.effect}</Row>);
      if (sk.steps?.length) rows.push(<Row key="st" k="Steps"><div>{sk.steps.map((s, i) => <div key={i} style={{ marginBottom: 2 }}>{i + 1}. {s}</div>)}</div></Row>);
      break;
    }
    case "SELF_EVAL_RESULT": {
      const r = p as { score?: number; failureModes?: string[] };
      if (r.score != null) {
        const sc = r.score >= 0.6 ? "#8dae6b" : r.score >= 0.4 ? "#c59b5c" : "#bf6f56";
        rows.push(<Row key="sc" k="Score"><Accent c={sc}>{r.score.toFixed(2)}</Accent></Row>);
        rows.push(<Bar key="bar" value={r.score} color={sc} />);
      }
      if (r.failureModes?.length)
        rows.push(<Row key="fm" k="Risks"><div>{r.failureModes.map((f, i) => <div key={i} style={{ color: "#be8b55", marginBottom: 2 }}>· {f}</div>)}</div></Row>);
      break;
    }
    case "SKILL_ACCEPTED": {
      const sk = (p as { skill?: { name?: string; id?: string; provenance?: { reasonReceipt?: string; selfEvalReceipt?: string; selfEvalScore?: number } } }).skill ?? {};
      const pv = sk.provenance ?? {};
      if (sk.name) rows.push(<Row key="n" k="Skill"><Accent c="#8dae6b">{sk.name}</Accent></Row>);
      if (pv.selfEvalScore != null) {
        rows.push(<Row key="sc" k="Eval Score"><Accent c="#8dae6b">{pv.selfEvalScore.toFixed(2)}</Accent></Row>);
        rows.push(<Bar key="bar" value={pv.selfEvalScore} color="#8dae6b" />);
      }
      if (pv.reasonReceipt)   rows.push(<Row key="rr" k="Reason Hash"><Mono>{shortHash(pv.reasonReceipt)}</Mono></Row>);
      if (pv.selfEvalReceipt) rows.push(<Row key="er" k="Eval Hash"><Mono>{shortHash(pv.selfEvalReceipt)}</Mono></Row>);
      if (sk.id)              rows.push(<Row key="id" k="Skill ID"><Mono>{sk.id}</Mono></Row>);
      break;
    }
    case "SKILL_REJECTED": {
      const r = p as { reason?: string; score?: number };
      if (r.score != null) { rows.push(<Row key="sc" k="Score"><Accent c="#bf6f56">{r.score.toFixed(2)}</Accent></Row>); rows.push(<Bar key="bar" value={r.score} color="#bf6f56" />); }
      if (r.reason) rows.push(<Row key="r" k="Reason"><Accent c="#bf6f56">{r.reason}</Accent></Row>);
      break;
    }
    case "SKILL_DECLINED": {
      const d = p as { skillName?: string; skillEffect?: string; score?: number; reason?: string };
      if (d.skillName)   rows.push(<Row key="n" k="Skill">{d.skillName}</Row>);
      if (d.skillEffect) rows.push(<Row key="e" k="Effect">{d.skillEffect}</Row>);
      if (d.score != null) { rows.push(<Row key="sc" k="Score"><Accent c="#be8b55">{d.score.toFixed(2)}</Accent></Row>); rows.push(<Bar key="bar" value={d.score} color="#be8b55" />); }
      if (d.reason) rows.push(<Row key="r" k="Reason"><Accent c="#be8b55">{d.reason}</Accent></Row>);
      break;
    }
    case "AXL_MESSAGE": {
      const m = p as { from?: string; to?: string; kind?: string; body?: unknown };
      if (m.from && m.to) rows.push(<Row key="rt" k="Route"><Accent c="#83aaba">{m.from} {"→"} {m.to}</Accent></Row>);
      if (m.kind)         rows.push(<Row key="k"  k="Msg Kind">{m.kind}</Row>);
      if (m.body)         rows.push(<Row key="b"  k="Body"><Mono>{JSON.stringify(m.body).slice(0, 80)}</Mono></Row>);
      break;
    }
    case "SKILL_LEARNED": case "SKILL_TAUGHT": {
      const l = p as { from?: string; to?: string; skillId?: string };
      const who = ev.kind === "SKILL_LEARNED" ? l.from : l.to;
      if (who)       rows.push(<Row key="w" k={ev.kind === "SKILL_LEARNED" ? "Learned From" : "Taught To"}><Accent c="#83aaba">{who}</Accent></Row>);
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
      margin: "6px 0 2px",
      padding: "10px 14px",
      background: "rgba(54, 39, 24, 0.34)",
      borderLeft: `3px solid ${color}`,
      borderRadius: "0 8px 8px 0",
    }}>
      {rows}
    </div>
  );
}

function HeaderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c4a46f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

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

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible.length]);

  const toggle = (idx: number) =>
    setExpanded(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });

  const glassStyle: React.CSSProperties = {
    background: "linear-gradient(180deg, rgba(42, 31, 20, 0.78) 0%, rgba(22, 17, 13, 0.74) 100%)",
    border: "1px solid rgba(204, 164, 96, 0.18)",
    backdropFilter: "blur(28px)",
    WebkitBackdropFilter: "blur(28px)",
    boxShadow: "0 24px 64px rgba(0,0,0,0.42), 0 4px 20px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,229,184,0.08)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", fontFamily: F, borderRadius: 10, overflow: "hidden", ...glassStyle, ...style }}>

      {/* Header */}
      <div style={{
        padding: "14px 18px 12px",
        flexShrink: 0,
        borderBottom: "1px solid rgba(204, 164, 96, 0.14)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: "linear-gradient(180deg, rgba(84, 58, 30, 0.26), rgba(0,0,0,0.06))",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <HeaderIcon />
          <div>
            <div style={{ color: "#f0dfbd", fontSize: 13, fontWeight: 600, letterSpacing: 0.3 }}>Event Log</div>
            <div style={{ color: "#a78f6a", fontSize: 9.5, marginTop: 1, letterSpacing: 0.2 }}>Actions, crises & skill evolution</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {visible.length > 0 && (
            <span style={{
              color: "#d2ba87",
              fontSize: 10,
              fontWeight: 500,
              background: "rgba(244, 205, 136, 0.10)",
              border: "1px solid rgba(244, 205, 136, 0.14)",
              padding: "2px 7px",
              borderRadius: 10,
            }}>
              {visible.length}
            </span>
          )}
          {onHide && (
            <button onClick={onHide} style={{
              background: "rgba(244, 205, 136, 0.08)", border: "1px solid rgba(244, 205, 136, 0.10)", cursor: "pointer",
              color: "#a78f6a", fontSize: 12, padding: "2px 6px", lineHeight: 1,
              borderRadius: 4, transition: "background 0.15s",
            }}>✕</button>
          )}
        </div>
      </div>

      {/* Event rows */}
      <div ref={scrollRef} className="ep-scroll" style={{ flex: 1, overflowY: "auto", padding: "6px 0 10px" }}>
        {visible.length === 0 && (
          <div style={{ color: "#8b7658", fontSize: 11, textAlign: "center", marginTop: 32, letterSpacing: 0.3 }}>
            Awaiting signals…
          </div>
        )}

        {visible.map((ev, i) => {
          const isNeutral = NEUTRAL_KINDS.has(ev.kind);
          const color = isNeutral ? "#6a6258" : (KIND_COLOR[ev.kind] ?? "#7a6a54");
          const isOpen = expanded.has(i);
          const titleColor = isNeutral ? "#9a866a" : "#e3d1ad";
          const crisisId = (ev.payload as { crisisId?: string })?.crisisId;
          const skillUsed = (ev.payload as { skillUsed?: string })?.skillUsed;

          return (
            <div key={i} className="ep-row" onClick={() => !isNeutral && toggle(i)} style={{
              cursor: isNeutral ? "default" : "pointer",
              borderLeft: isOpen ? `2px solid ${color}` : "2px solid transparent",
              transition: "border-color 0.15s ease",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 16px 7px 14px" }}>
                <EventIcon kind={ev.kind} />
                <span style={{ color: titleColor, fontSize: 12.5, fontWeight: isOpen ? 500 : 400, flex: 1, lineHeight: 1.3 }}>
                  {label(ev.kind)}
                  {crisisId && <span style={{ color: "#a99578", fontSize: 10, marginLeft: 6 }}>{crisisId}</span>}
                  {skillUsed && <span style={{ color: "#a9b86c", fontSize: 10, marginLeft: 6 }}>via {skillUsed}</span>}
                  {ev.kind === "SKILL_DECLINED" && (ev.payload as { reason?: string })?.reason && (
                    <span style={{ color: "#be8b55", fontSize: 10, marginLeft: 6, fontStyle: "italic" }}>
                      — {(ev.payload as { reason?: string }).reason}
                    </span>
                  )}
                </span>
                <span style={{
                  color: "#c4a46f",
                  fontSize: 10,
                  fontWeight: 500,
                  background: "rgba(244, 205, 136, 0.08)",
                  border: "1px solid rgba(244, 205, 136, 0.08)",
                  padding: "1px 5px",
                  borderRadius: 3,
                }}>
                  {ev.actorId}
                </span>
                <span style={{ color: "#806d55", fontSize: 10, minWidth: 26, textAlign: "right", fontFamily: "monospace" }}>t{ev.tick}</span>
                {!isNeutral && (
                  <svg width="10" height="10" viewBox="0 0 10 10" style={{
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.2s ease",
                    opacity: 0.35,
                    flexShrink: 0,
                  }}>
                    <path d="M2 3.5L5 6.5L8 3.5" fill="none" stroke="#a99578" strokeWidth="1.2" />
                  </svg>
                )}
              </div>

              {isOpen && (
                <div style={{ padding: "0 16px 8px 44px" }}>
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
