import React, { useState, useEffect } from "react";
import { useStore, sendWs, type MarketListing } from "../store";
import { getAgentAvatar } from "../agentAvatars";
import { getPersonality } from "../personalities";

const F = "'DM Sans', system-ui, sans-serif";

type Listing = MarketListing;
type ImportStatus = "idle" | "importing" | "done" | "error";

function formatEth(wei: string): string {
  return (Number(wei) / 1e18).toFixed(4);
}

function Chip({ children, color = "#d9c59a", bg = "rgba(255,220,150,0.08)", border = "rgba(255,220,150,0.12)" }: {
  children: React.ReactNode;
  color?: string;
  bg?: string;
  border?: string;
}) {
  return (
    <span style={{
      color,
      fontSize: 9,
      padding: "3px 7px",
      borderRadius: 5,
      background: bg,
      border: `1px solid ${border}`,
      whiteSpace: "nowrap" as const,
    }}>
      {children}
    </span>
  );
}

function AgentCard({
  listing,
  agentId,
  status,
  onImport,
  isOwn,
}: {
  listing: Listing;
  agentId: string | undefined;
  status: ImportStatus;
  onImport: () => void;
  isOwn: boolean;
}) {
  const agents = useStore((s) => s.agents);
  const skills = useStore((s) => s.skills);
  const agent = agentId ? agents[agentId] : undefined;
  const personality = agentId ? getPersonality(agentId) : undefined;
  const avatar = listing.image ?? (agentId ? getAgentAvatar(agentId) : getAgentAvatar("alice"));
  const traits = listing.traits ?? agent?.traits ?? personality?.traits ?? [];
  const knownSkillIds = agent?.knownSkillIds ?? [];
  const nftSkills = listing.skills;
  const busy = status === "importing" || status === "done";

  return (
    <div style={{
      borderRadius: 12,
      padding: "18px 16px 14px",
      background: "linear-gradient(180deg, rgba(36, 27, 18, 0.90), rgba(22, 17, 12, 0.88))",
      border: "1px solid rgba(231, 190, 110, 0.18)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,235,180,0.07)",
      display: "flex",
      flexDirection: "column",
      gap: 10,
      minWidth: 0,
    }}>
      {/* Avatar + name */}
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <img
          src={avatar}
          alt={listing.name ?? personality?.name ?? listing.tokenId}
          width={52}
          height={52}
          style={{ borderRadius: "50%", border: "2px solid #d2a85f", background: "#261a10", flexShrink: 0 }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "#f4dfb2", fontSize: 16, fontWeight: 800, lineHeight: 1.2 }}>
            {listing.name ?? personality?.name ?? `Token #${listing.tokenId}`}
          </div>
          <div style={{ color: "#9e8760", fontSize: 9, marginTop: 2 }}>
            TOKEN #{listing.tokenId}
          </div>
        </div>
      </div>

      {/* World badge */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
        <Chip color="#83aaba" bg="rgba(131,170,186,0.10)" border="rgba(131,170,186,0.22)">
          🌍 {listing.worldId}
        </Chip>
        {agent?.alive === false && (
          <Chip color="#c59b5c" bg="rgba(197,155,92,0.10)" border="rgba(197,155,92,0.22)">dormant</Chip>
        )}
      </div>

      {/* Traits */}
      {traits.length > 0 && (
        <div>
          <div style={{ color: "#bda16f", fontSize: 9, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase" as const, marginBottom: 5 }}>
            Traits
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" as const }}>
            {traits.map((t) => <Chip key={t}>{t}</Chip>)}
          </div>
        </div>
      )}

      {/* Skills */}
      <div>
        {nftSkills ? (
          <>
            <div style={{ color: "#bda16f", fontSize: 9, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase" as const, marginBottom: 5 }}>
              Skills ({nftSkills.length})
            </div>
            {nftSkills.length === 0 ? (
              <span style={{ color: "#6a5f52", fontSize: 10 }}>No skills recorded</span>
            ) : (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" as const }}>
                {nftSkills.slice(0, 4).map((s) => (
                  <Chip key={s.id} color="#a9b86c" bg="rgba(169,184,108,0.09)" border="rgba(169,184,108,0.20)">{s.name}</Chip>
                ))}
                {nftSkills.length > 4 && <Chip color="#8d7b63">+{nftSkills.length - 4} more</Chip>}
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ color: "#bda16f", fontSize: 9, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase" as const, marginBottom: 5 }}>
              Skills ({knownSkillIds.length})
            </div>
            {knownSkillIds.length === 0 ? (
              <span style={{ color: "#6a5f52", fontSize: 10 }}>No skills recorded</span>
            ) : (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" as const }}>
                {knownSkillIds.slice(0, 4).map((sid) => (
                  <Chip key={sid} color="#a9b86c" bg="rgba(169,184,108,0.09)" border="rgba(169,184,108,0.20)">
                    {skills[sid]?.name ?? sid.slice(0, 10)}
                  </Chip>
                ))}
                {knownSkillIds.length > 4 && <Chip color="#8d7b63">+{knownSkillIds.length - 4} more</Chip>}
              </div>
            )}
          </>
        )}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Price + IMPORT */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderTop: "1px solid rgba(231,190,110,0.10)",
        paddingTop: 10,
        marginTop: 2,
        gap: 8,
      }}>
        <div>
          <div style={{ color: "#bda16f", fontSize: 9, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase" as const }}>Price</div>
          <div style={{ color: "#e8c97a", fontSize: 15, fontWeight: 800 }}>
            {formatEth(listing.salePriceWei)} 0G
          </div>
        </div>
        {isOwn ? (
          <span style={{ color: "#8d7b63", fontSize: 10, fontWeight: 700, letterSpacing: 0.4, flexShrink: 0 }}>YOUR AGENT</span>
        ) : <button
          onClick={onImport}
          disabled={busy}
          style={{
            padding: "7px 16px",
            borderRadius: 6,
            border: status === "error"
              ? "1px solid rgba(191,111,86,0.55)"
              : "1px solid rgba(141,174,107,0.40)",
            background: status === "error"
              ? "rgba(191,111,86,0.16)"
              : status === "done"
                ? "rgba(141,174,107,0.16)"
                : "rgba(141,174,107,0.10)",
            color: status === "error" ? "#bf6f56"
              : status === "done" ? "#8dae6b"
                : "#a9c882",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.6,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.7 : 1,
            transition: "all 0.15s",
            fontFamily: F,
            flexShrink: 0,
          }}
        >
          {status === "importing" ? "Importing…"
            : status === "done" ? "Imported ✓"
              : status === "error" ? "Failed"
                : "IMPORT"}
        </button>}
      </div>
    </div>
  );
}

export function MarketplaceModal({ onClose }: { onClose: () => void }) {
  const listings = useStore((s) => s.marketListings.filter((l) => l.active && l.name));
  const [loading, setLoading] = useState(false);
  const [importStatus, setImportStatus] = useState<Record<string, ImportStatus>>({});
  const agentTokens = useStore((s) => s.agentTokens);
  const events = useStore((s) => s.events);

  // Reverse map: tokenId → agentId
  const tokenToAgent = Object.fromEntries(
    Object.entries(agentTokens).map(([agentId, tokenId]) => [tokenId, agentId]),
  );

  // Request listings on mount via WS
  useEffect(() => {
    sendWs({ kind: "MARKETPLACE_GET_LISTINGS" });
  }, []);

  // Watch for import outcomes
  useEffect(() => {
    const last = events.at(-1);
    if (!last) return;
    if (last.kind === "AGENT_IMPORTED") {
      const tokenId = (last.payload as { tokenId?: string })?.tokenId;
      if (tokenId) setImportStatus((prev) => ({ ...prev, [tokenId]: "done" }));
    } else if (last.kind === "MARKETPLACE_ERROR") {
      const tokenId = (last.payload as { tokenId?: string })?.tokenId;
      if (tokenId) {
        setImportStatus((prev) => ({ ...prev, [tokenId]: "error" }));
        setTimeout(() => setImportStatus((prev) => ({ ...prev, [tokenId]: "idle" })), 3000);
      }
    }
  }, [events]);

  function handleImport(tokenId: string, salePriceWei: string) {
    setImportStatus((prev) => ({ ...prev, [tokenId]: "importing" }));
    sendWs({ kind: "MARKETPLACE_IMPORT", tokenId, salePriceWei });
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 90,
          background: "rgba(5, 3, 2, 0.72)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
      />

      {/* Modal */}
      <div style={{
        position: "fixed",
        inset: 0,
        zIndex: 91,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
      }}>
        <div style={{
          width: "min(90vw, 780px)",
          maxHeight: "82vh",
          borderRadius: 16,
          background: "linear-gradient(180deg, rgba(28, 21, 14, 0.96), rgba(16, 12, 8, 0.96))",
          border: "1px solid rgba(231, 190, 110, 0.22)",
          boxShadow: "0 40px 120px rgba(0,0,0,0.70), inset 0 1px 0 rgba(255,235,180,0.09)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          pointerEvents: "all",
          fontFamily: F,
        }}>
          {/* Header */}
          <div style={{
            padding: "20px 24px 16px",
            borderBottom: "1px solid rgba(204, 164, 96, 0.14)",
            background: "linear-gradient(180deg, rgba(84, 58, 30, 0.24), rgba(0,0,0,0.04))",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexShrink: 0,
          }}>
            <div>
              <div style={{ color: "#f0dfbd", fontSize: 18, fontWeight: 800, letterSpacing: 0.3 }}>Marketplace</div>
              <div style={{ color: "#a78f6a", fontSize: 10.5, marginTop: 2 }}>
                On-chain agent listings — import to spawn on your engine
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={() => { sendWs({ kind: "MARKETPLACE_CLEAN" }); setTimeout(() => sendWs({ kind: "MARKETPLACE_GET_LISTINGS" }), 3000); }}
                style={{
                  background: "rgba(228, 90, 69, 0.08)", border: "1px solid rgba(228, 90, 69, 0.18)",
                  cursor: "pointer", color: "#e45a45", fontSize: 11, padding: "4px 10px",
                  borderRadius: 5, fontFamily: F,
                }}
              >Clean</button>
              <button
                onClick={() => { setLoading(true); sendWs({ kind: "MARKETPLACE_GET_LISTINGS" }); setTimeout(() => setLoading(false), 2000); }}
                style={{
                  background: "rgba(244, 205, 136, 0.08)", border: "1px solid rgba(244, 205, 136, 0.12)",
                  cursor: "pointer", color: "#c4a46f", fontSize: 13, padding: "4px 10px",
                  borderRadius: 5, fontFamily: F,
                }}
              >↺ Refresh</button>
              <button
                onClick={onClose}
                style={{
                  background: "rgba(244, 205, 136, 0.08)", border: "1px solid rgba(244, 205, 136, 0.12)",
                  cursor: "pointer", color: "#a78f6a", fontSize: 16, padding: "2px 8px",
                  borderRadius: 5, lineHeight: 1, fontFamily: F,
                }}
              >✕</button>
            </div>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px 24px" }}>
            {loading && listings.length === 0 && (
              <div style={{ color: "#8b7658", fontSize: 13, textAlign: "center", marginTop: 40 }}>
                Loading listings…
              </div>
            )}
            {!loading && listings.length === 0 && (
              <div style={{ color: "#8b7658", fontSize: 13, textAlign: "center", marginTop: 40 }}>
                No agents listed for trade
              </div>
            )}
            {listings.length > 0 && (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
                gap: 16,
              }}>
                {listings.map((l) => (
                  <AgentCard
                    key={l.tokenId}
                    listing={l}
                    agentId={tokenToAgent[l.tokenId]}
                    status={importStatus[l.tokenId] ?? "idle"}
                    onImport={() => handleImport(l.tokenId, l.salePriceWei)}
                    isOwn={l.tokenId in tokenToAgent}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
