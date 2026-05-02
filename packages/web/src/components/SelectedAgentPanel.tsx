import React, { useState, useEffect } from "react";
import { getAgentAvatar } from "../agentAvatars";
import { getItemIcon, getItemLabel } from "../items";
import { getAgentInventory, getPersonality } from "../personalities";
import { useStore, sendWs, type AgentInfo } from "../store";

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
  const agentTokens = useStore((state) => state.agentTokens);
  const listedAgentIds = useStore((state) => state.listedAgentIds);
  const agent = selectedAgentId ? agents[selectedAgentId] : undefined;

  const addToast = useStore((state) => state.addToast);
  const events = useStore((state) => state.events);

  // Per-agent market state so switching agents never clobbers an in-flight operation
  const [marketStates, setMarketStates] = useState<Record<string, "idle" | "pending" | "listed" | "error">>({});
  const [marketErrors, setMarketErrors] = useState<Record<string, string>>({});
  const [listPrices, setListPrices] = useState<Record<string, string>>({});

  // React to WS events for this agent to transition pending state
  const lastMarketEvent = selectedAgentId
    ? events.filter((e) => (e.kind === "AGENT_LISTED" || e.kind === "AGENT_DELISTED" || e.kind === "MARKETPLACE_ERROR") && e.actorId === selectedAgentId).at(-1)
    : undefined;

  useEffect(() => {
    if (!lastMarketEvent || !selectedAgentId) return;
    if (lastMarketEvent.kind === "AGENT_LISTED") {
      setMarketStates((prev) => ({ ...prev, [selectedAgentId]: "idle" }));
      addToast(`Agent ${agents[selectedAgentId]?.name ?? getPersonality(selectedAgentId).name} listed on marketplace`);
    } else if (lastMarketEvent.kind === "AGENT_DELISTED") {
      setMarketStates((prev) => ({ ...prev, [selectedAgentId]: "idle" }));
      addToast(`Agent ${agents[selectedAgentId]?.name ?? getPersonality(selectedAgentId).name} delisted`);
    } else if (lastMarketEvent.kind === "MARKETPLACE_ERROR") {
      const msg = (lastMarketEvent.payload?.message as string) ?? "Request failed";
      setMarketStates((prev) => ({ ...prev, [selectedAgentId]: "error" }));
      setMarketErrors((prev) => ({ ...prev, [selectedAgentId]: msg }));
    }
  }, [lastMarketEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!agent) return null;

  const agentId = agent.id;
  const tokenId = agentTokens[agentId];
  const isListed = listedAgentIds[agentId] ?? false;
  const marketState = isListed ? "listed" : (marketStates[agentId] ?? "idle");
  const marketError = marketErrors[agentId] ?? "";
  const listPrice = listPrices[agentId] ?? "1";

  function setListPrice(id: string, v: string) {
    setListPrices((prev) => ({ ...prev, [id]: v }));
  }

  function handleList() {
    if (!tokenId) return;
    setMarketStates((prev) => ({ ...prev, [agentId]: "pending" }));
    sendWs({ kind: "MARKETPLACE_LIST", agentId, tokenId, salePriceWei: ogToWei(listPrice) });
  }

  function handleDelist() {
    if (!tokenId) return;
    setMarketStates((prev) => ({ ...prev, [agentId]: "pending" }));
    sendWs({ kind: "MARKETPLACE_DELIST", agentId, tokenId });
  }

  const personality = getPersonality(agentId);
  const inventory = getAgentInventory(agentId);
  const targeted = lionState.active && lionState.targets.includes(agentId);
  const energy = energyRatio(agent);
  const hunger = 1 - energy;
  const health = agent.alive ? (targeted ? 0.72 : 0.88) : 0;
  const stableId = `AG-${String(hashAgent(agentId) * 17).padStart(4, "0").slice(0, 4)}`;

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
        <div style={{ position: "relative", flexShrink: 0 }}>
          <img src={agent.image ?? getAgentAvatar(agentId)} alt={`${personality.name} avatar`} width={58} height={58} style={{ borderRadius: "50%", border: "2px solid #d2a85f", background: "#261a10" }} />
          {marketState === "listed" && (
            <div style={{ position: "absolute", bottom: -2, right: -4, background: "#8fd16d", color: "#1a2e12", fontSize: 7, fontWeight: 900, padding: "2px 5px", borderRadius: 4, letterSpacing: 0.4, textTransform: "uppercase", boxShadow: "0 2px 6px rgba(0,0,0,0.4)" }}>
              FOR SALE
            </div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#f4dfb2" }}>{agent.name ?? personality.name}</div>
          <div style={{ color: "#bda16f", fontSize: 10 }}>AGE {18 + (hashAgent(agentId) % 14)}</div>
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

      {tokenId && (
        <Section title="Marketplace">
          {marketState === "error" && (
            <div style={{ color: "#ff7b62", fontSize: 10, marginBottom: 6, wordBreak: "break-word" }}>
              {marketError || "Request failed — check engine logs"}
            </div>
          )}
          {marketState === "listed" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 6, background: "rgba(143,209,109,0.10)", border: "1px solid rgba(143,209,109,0.22)" }}>
                <span style={{ color: "#8fd16d", fontSize: 10 }}>✓</span>
                <span style={{ color: "#a9c882", fontSize: 10, fontWeight: 700 }}>Listed for sale</span>
              </div>
              <button
                type="button"
                onClick={handleDelist}
                disabled={marketState !== "listed"}
                style={btnStyle("#e45a45", "#ff8c74")}
              >
                Delist Agent
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#a88f6a", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>Price (0G)</span>
                <input
                  value={listPrice}
                  onChange={(e) => setListPrice(agentId, e.target.value)}
                  style={{ flex: 1, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(231,190,110,0.18)", borderRadius: 5, color: "#f0dfbd", fontSize: 10, padding: "3px 6px", fontFamily: F }}
                />
              </div>
              <button
                type="button"
                onClick={handleList}
                disabled={marketState === "pending"}
                style={btnStyle("#8fd16d", "#a9c882")}
              >
                {marketState === "pending" ? "Listing…" : "List on Marketplace"}
              </button>
            </div>
          )}
        </Section>
      )}
    </aside>
  );
}

function ogToWei(og: string): string {
  const parts = og.trim().split(".");
  const whole = parts[0] || "0";
  const decimal = (parts[1] || "").padEnd(18, "0").slice(0, 18);
  return (BigInt(whole) * 1_000_000_000_000_000_000n + BigInt(decimal)).toString();
}

function btnStyle(borderColor: string, color: string): React.CSSProperties {
  return {
    width: "100%",
    padding: "6px 10px",
    borderRadius: 6,
    border: `1px solid ${borderColor}44`,
    background: `${borderColor}18`,
    color,
    fontSize: 10,
    fontWeight: 700,
    fontFamily: F,
    cursor: "pointer",
    transition: "all 0.15s",
  };
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
