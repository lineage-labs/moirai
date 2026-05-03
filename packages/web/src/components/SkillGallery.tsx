import React, { useState } from "react";
import { useStore } from "../store";
import { getPersonality } from "../personalities";

const F = "'DM Sans', system-ui, sans-serif";

const OG_BASE = "https://storagescan-galileo.0g.ai/submission";

function shortHash(h: string) {
  return `${h.slice(0, 7)}…${h.slice(-5)}`;
}

function ScoreBar({ value }: { value: number }) {
  const color = value >= 0.6 ? "#8dae6b" : value >= 0.4 ? "#c59b5c" : "#bf6f56";
  return (
    <div style={{ height: 3, borderRadius: 999, background: "rgba(255,255,255,0.07)", overflow: "hidden", marginTop: 3 }}>
      <div style={{ width: `${Math.round(value * 100)}%`, height: "100%", background: color, borderRadius: 999 }} />
    </div>
  );
}

export function SkillGallery() {
  const skills = useStore((s) => s.skills);
  const agents = useStore((s) => s.agents);
  const [collapsed, setCollapsed] = useState(false);

  // Only show skills currently held by at least one living agent
  const activeSkillIds = new Set(
    Object.values(agents)
      .filter((a) => a.alive)
      .flatMap((a) => a.knownSkillIds),
  );
  const skillList = Object.values(skills)
    .filter((s) => activeSkillIds.has(s.id))
    .sort((a, b) => b.tick - a.tick);

  if (skillList.length === 0) return null;

  return (
    <aside
      style={{
        position: "absolute",
        right: 14,
        bottom: 120,
        width: 230,
        zIndex: 44,
        borderRadius: 12,
        background: "linear-gradient(180deg, rgba(28,22,15,0.88), rgba(16,13,10,0.84))",
        border: "1px solid rgba(231,190,110,0.20)",
        boxShadow: "0 20px 52px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,235,180,0.08)",
        backdropFilter: "blur(13px)",
        fontFamily: F,
        overflow: "hidden",
        pointerEvents: "auto",
      }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          borderBottom: collapsed ? "none" : "1px solid rgba(231,190,110,0.10)",
          padding: "9px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          fontFamily: F,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 15 }}>✨</span>
          <span style={{ color: "#bda16f", fontSize: 9, fontWeight: 800, letterSpacing: 0.9, textTransform: "uppercase" }}>
            Skill Gallery
          </span>
          <span
            style={{
              color: "#8a7a5f",
              fontSize: 9,
              background: "rgba(255,220,150,0.08)",
              border: "1px solid rgba(255,220,150,0.14)",
              borderRadius: 999,
              padding: "1px 6px",
            }}
          >
            {skillList.length}
          </span>
        </div>
        <span style={{ color: "#6a5c48", fontSize: 10 }}>{collapsed ? "▲" : "▼"}</span>
      </button>

      {/* Skill list */}
      {!collapsed && (
        <div
          style={{
            maxHeight: 288,
            overflowY: "auto",
            padding: "8px 10px 10px",
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(196,151,84,0.22) transparent",
          }}
        >
          {skillList.map((skill) => {
            const inventor = getPersonality(skill.inventedBy);
            // Use txSeq (sequence ID) for the storagescan URL — that's what the scanner indexes by
            const ogLink = skill.storageSequenceId != null
              ? `${OG_BASE}/${skill.storageSequenceId}`
              : null;

            return (
              <div
                key={skill.id}
                style={{
                  marginBottom: 8,
                  padding: "9px 10px",
                  borderRadius: 9,
                  background: skill.verifiable
                    ? "rgba(60,44,12,0.40)"
                    : "rgba(0,0,0,0.22)",
                  border: skill.verifiable
                    ? "1px solid rgba(225,178,73,0.26)"
                    : "1px solid rgba(255,220,150,0.08)",
                }}
              >
                {/* Name row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ color: "#ffe2a3", fontSize: 11, fontWeight: 800 }}>
                    ✨ {skill.name}
                  </span>
                  {skill.verifiable && (
                    <span
                      style={{
                        fontSize: 8,
                        color: "#7ea88a",
                        fontWeight: 800,
                        border: "1px solid rgba(126,168,138,0.35)",
                        borderRadius: 3,
                        padding: "1px 5px",
                        letterSpacing: 0.5,
                      }}
                    >
                      ⛓ 0G
                    </span>
                  )}
                </div>

                {/* Inventor + tick */}
                <div style={{ color: "#7a6a52", fontSize: 9, marginBottom: skill.selfEvalScore != null ? 5 : 4 }}>
                  by{" "}
                  <span style={{ color: "#a08060" }}>{inventor.name}</span>
                  {" · "}tick {skill.tick}
                </div>

                {/* Eval score */}
                {skill.selfEvalScore != null && (
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#9a8870", fontSize: 8, marginBottom: 1 }}>
                      <span>Self-eval score</span>
                      <span style={{ fontWeight: 700 }}>{skill.selfEvalScore.toFixed(2)}</span>
                    </div>
                    <ScoreBar value={skill.selfEvalScore} />
                  </div>
                )}

                {/* Receipt hashes */}
                {skill.verifiable && (skill.reasonReceipt || skill.selfEvalReceipt) && (
                  <div style={{ marginBottom: 6 }}>
                    {skill.reasonReceipt && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                        <span style={{ color: "#5a4e3e", fontSize: 8 }}>Reason</span>
                        <span style={{ color: "#7a6a52", fontFamily: "monospace", fontSize: 8 }}>
                          {shortHash(skill.reasonReceipt)}
                        </span>
                      </div>
                    )}
                    {skill.selfEvalReceipt && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ color: "#5a4e3e", fontSize: 8 }}>Eval</span>
                        <span style={{ color: "#7a6a52", fontFamily: "monospace", fontSize: 8 }}>
                          {shortHash(skill.selfEvalReceipt)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* 0G Storage link */}
                {ogLink && (
                  <a
                    href={ogLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      color: "#7ea88a",
                      fontSize: 9,
                      fontWeight: 700,
                      textDecoration: "none",
                      border: "1px solid rgba(126,168,138,0.30)",
                      borderRadius: 4,
                      padding: "3px 7px",
                      background: "rgba(126,168,138,0.07)",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(126,168,138,0.16)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(126,168,138,0.07)")}
                  >
                    ⛓ View on 0G Storage
                  </a>
                )}

                {/* Skill ID (small, for devs) */}
                <div style={{ color: "#4a3e2e", fontFamily: "monospace", fontSize: 7, marginTop: 5, wordBreak: "break-all" }}>
                  {skill.id.slice(0, 28)}{skill.id.length > 28 ? "…" : ""}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
