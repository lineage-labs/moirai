import React from "react";
import { getAgentAvatar } from "../agentAvatars";
import { getItemIcon, getItemLabel } from "../items";
import { getAgentInventory, getPersonality } from "../personalities";
import { useStore, type AgentInfo } from "../store";

const F = "'DM Sans', system-ui, sans-serif";

function hashAgent(id: string): number {
  return [...id].reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

function energyRatio(agent: AgentInfo): number {
  if (!agent.hunger || agent.hunger.threshold <= 0) return 0.78;
  return Math.max(0, Math.min(1, 1 - agent.hunger.current / agent.hunger.threshold));
}

function statusText(agent: AgentInfo, targeted: boolean): string {
  if (!agent.alive) return "Down";
  if (targeted) return "Running from Lion";
  if (agent.status === "reasoning") return "Thinking";
  if (agent.status === "crisis") return "In danger";
  return "Exploring";
}

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", color: "#c9b483", fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
        <span>{label}</span>
        <span>{pct}/100</span>
      </div>
      <div style={{ height: 7, borderRadius: 999, background: "rgba(0,0,0,0.48)", overflow: "hidden", border: "1px solid rgba(255,220,150,0.10)" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 999, boxShadow: `0 0 10px ${color}` }} />
      </div>
    </div>
  );
}

export function SelectedAgentPanel() {
  const agents = useStore((state) => state.agents);
  const selectedAgentId = useStore((state) => state.selectedAgentId);
  const selectAgent = useStore((state) => state.selectAgent);
  const lionState = useStore((state) => state.lionState);
  const skills = useStore((state) => state.skills);
  const agent = selectedAgentId ? agents[selectedAgentId] : undefined;

  if (!agent) return null;

  const personality = getPersonality(agent.id);
  const inventory = getAgentInventory(agent.id);
  const targeted = lionState.active && lionState.targets.includes(agent.id);
  const energy = energyRatio(agent);
  const hunger = 1 - energy;
  const health = agent.alive ? (targeted ? 0.72 : 0.88) : 0;
  const stableId = `AG-${String(hashAgent(agent.id) * 17).padStart(4, "0").slice(0, 4)}`;

  return (
    <aside
      style={{
        position: "absolute",
        top: 82,
        left: 14,
        width: 214,
        zIndex: 45,
        borderRadius: 12,
        padding: 14,
        background: "linear-gradient(180deg, rgba(28, 22, 15, 0.86), rgba(18, 15, 12, 0.82))",
        border: "1px solid rgba(231, 190, 110, 0.22)",
        boxShadow: "0 24px 60px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,235,180,0.08)",
        backdropFilter: "blur(12px)",
        fontFamily: F,
        color: "#f0dfbd",
      }}
    >
      <button
        type="button"
        onClick={() => selectAgent(null)}
        style={{ position: "absolute", top: 10, right: 10, background: "transparent", border: "none", color: "#9f8968", cursor: "pointer" }}
        aria-label="Close selected agent panel"
      >
        ×
      </button>
      <div style={{ color: "#bda16f", fontSize: 9, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 12 }}>
        Selected Agent
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
        <img src={getAgentAvatar(agent.id)} alt={`${personality.name} avatar`} width={68} height={68} style={{ borderRadius: "50%", border: "2px solid #d2a85f", background: "#261a10" }} />
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#f4dfb2" }}>{personality.name}</div>
          <div style={{ color: "#bda16f", fontSize: 10 }}>AGE {18 + (hashAgent(agent.id) % 14)}</div>
          <div style={{ color: "#8d7b63", fontSize: 9 }}>ID: {stableId}</div>
        </div>
      </div>
      <Section title="Status">
        <div style={{ color: targeted ? "#ff7b62" : "#9bd76e", fontSize: 12, fontWeight: 700 }}>{statusText(agent, targeted)}</div>
      </Section>
      <Meter label="Health" value={health} color={health > 0.4 ? "#53c66d" : "#e45a45"} />
      <Meter label="Hunger" value={hunger} color={hunger > 0.7 ? "#e45a45" : "#d8a64a"} />
      <Meter label="Energy" value={energy} color={energy > 0.35 ? "#52bfe8" : "#e5bd5d"} />
      <Section title="Mood">
        <span style={{ color: targeted ? "#ffb36e" : "#9bd76e", fontSize: 12 }}>{targeted ? "Alert" : "Good"}</span>
      </Section>
      <Section title="Goal">
        <div style={{ color: "#d9c59a", fontSize: 11, lineHeight: 1.35 }}>{targeted ? "Escape the lion and survive the crisis" : "Explore the savannah and gather useful skills"}</div>
      </Section>
      <Section title="Traits">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(agent.traits ?? personality.traits ?? []).map((trait) => <Chip key={trait}>{trait}</Chip>)}
        </div>
      </Section>
      <Section title="Skills">
        <div style={{ display: "grid", gap: 6 }}>
          {agent.knownSkillIds.length === 0 ? <span style={{ color: "#8d7b63", fontSize: 11 }}>No learned skills yet</span> : agent.knownSkillIds.map((skillId, index) => (
            <div key={skillId} style={{ display: "flex", justifyContent: "space-between", color: "#d9c59a", fontSize: 11 }}>
              <span>{skills[skillId]?.name ?? skillId.slice(0, 12)}</span>
              <span>Lv {index + 1}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Inventory">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {inventory.map((item) => (
            <div key={item} title={getItemLabel(item)} style={{ width: 34, height: 34, display: "grid", placeItems: "center", borderRadius: 8, background: "rgba(255,220,150,0.08)", border: "1px solid rgba(255,220,150,0.16)" }}>
              <img src={getItemIcon(item)} alt={getItemLabel(item)} width={24} height={24} />
            </div>
          ))}
        </div>
      </Section>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ color: "#bda16f", fontSize: 9, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 5 }}>{title}</div>
      {children}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ color: "#d9c59a", fontSize: 9, padding: "4px 6px", borderRadius: 5, background: "rgba(255,220,150,0.08)", border: "1px solid rgba(255,220,150,0.10)" }}>
      {children}
    </span>
  );
}
