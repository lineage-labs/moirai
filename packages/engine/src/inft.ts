import { INFTAdapter, MarketplaceAdapter } from "@moirai/inft";
import type { AgentNFTMetadata } from "@moirai/inft";
import type { Event } from "@moirai/shared";
import { loadPersonality } from "@moirai/personality";
import type { AgentEntry, SkillEntry } from "./types.js";

export const WORLD_ID = process.env["WORLD_ID"] ?? "savannah";

export const INFT_ENABLED = !!(
  process.env["INFT_CONTRACT_ADDRESS"] &&
  process.env["MARKETPLACE_CONTRACT_ADDRESS"] &&
  process.env["ZG_PRIVATE_KEY"] &&
  process.env["ZG_RPC_URL"] &&
  process.env["ZG_INDEXER_URL"]
);

export const inftAdapter = INFT_ENABLED
  ? new INFTAdapter({
      rpcUrl: process.env["ZG_RPC_URL"]!,
      contractAddress: process.env["INFT_CONTRACT_ADDRESS"]!,
      privateKey: process.env["ZG_PRIVATE_KEY"]!,
      indexerUrl: process.env["ZG_INDEXER_URL"]!,
    })
  : null;

export const marketplaceAdapter = INFT_ENABLED
  ? new MarketplaceAdapter({
      rpcUrl: process.env["ZG_RPC_URL"]!,
      contractAddress: process.env["MARKETPLACE_CONTRACT_ADDRESS"]!,
      privateKey: process.env["ZG_PRIVATE_KEY"]!,
    })
  : null;

export function buildMetadata(
  entry: AgentEntry,
  skills: Map<string, SkillEntry>,
  tick: number,
): AgentNFTMetadata {
  const personalityId = entry.personalityId ?? entry.id;
  const personality = loadPersonality(personalityId);
  return {
    schemaVersion: 1,
    agentId: entry.id,
    personalityId,
    worldId: WORLD_ID,
    name: personality.name,
    traits: personality.traits ?? [],
    image: entry.image ?? "",
    tokenId: entry.tokenId ?? "",
    ancestorTokenIds: [],
    spawnTick: tick,
    skills: [...entry.knownSkillIds].flatMap((skillId) => {
      const s = skills.get(skillId);
      if (!s?.rootHash) return [];
      return [{ id: skillId, name: s.skill.name, rootHash: s.rootHash }];
    }),
    status: "alive",
  };
}

export function minifySvg(svg: string): string {
  return svg
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s*\n\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/> </g, "><")
    .trim();
}

const EXTERNAL_URL = process.env["MOIRAI_EXTERNAL_URL"] ?? "https://moirai.ai";

export function buildTokenURI(
  entry: AgentEntry,
  skills: Map<string, SkillEntry>,
): string {
  const personalityId = entry.personalityId ?? entry.id;
  const personality = loadPersonality(personalityId);
  const name = personality.name;
  const learnedSkills = [...entry.knownSkillIds].map((sid) => skills.get(sid)?.skill.name ?? sid);
  const symbol = `${name.slice(0, 4).toUpperCase()}${String(entry.tokenId ?? "").padStart(3, "0")}`;

  const json = JSON.stringify({
    name,
    symbol,
    description: `${name} is an autonomous AI agent surviving in the Moirai savannah. Powered by 0G Compute sealed inference. Skills: ${learnedSkills.join(", ") || "none yet"}.`,
    external_url: EXTERNAL_URL,
    category: "AI Agent",
    links: { website: EXTERNAL_URL },
    attributes: [
      ...(personality.traits ?? []).map((t: string) => ({ trait_type: "Trait", value: t })),
      ...learnedSkills.map((s) => ({ trait_type: "Skill", value: s })),
      { trait_type: "World", value: WORLD_ID },
      { trait_type: "Status", value: entry.alive ? "Alive" : "Dormant" },
    ],
  });
  return `data:application/json;base64,${Buffer.from(json).toString("base64")}`;
}

export function startContractListeners(ctx: {
  agents: Map<string, AgentEntry>;
  broadcast: (ev: Event) => void;
  getTick: () => number;
  spawnFromNFT: (tokenId: string) => Promise<string | null>;
}): void {
  if (!inftAdapter || !marketplaceAdapter) return;

  // Seller engine: buyer paid on-chain → kill agent + transfer token
  marketplaceAdapter.contractInstance.on("Sold", (tokenId: bigint, buyer: string) => {
    const entry = [...ctx.agents.values()].find(a => a.tokenId === tokenId.toString());
    if (!entry) return;
    entry.sold = true;
    entry.alive = false;
    entry.listed = false;
    entry.proc.stdin!.write(JSON.stringify({ kind: "DIE", reason: "sold" }) + "\n");
    ctx.broadcast({ kind: "AGENT_SOLD", tick: ctx.getTick(), actorId: entry.id, payload: { tokenId: tokenId.toString() } });
    inftAdapter!.transfer(tokenId.toString(), buyer).catch(console.error);
  });

  // Buyer engine: token arrived in our wallet → spawn the agent
  inftAdapter.contractInstance.on("Transfer", (_from: string, to: string, tokenId: bigint) => {
    if (to.toLowerCase() !== inftAdapter!.walletAddress.toLowerCase()) return;
    if (_from === "0x0000000000000000000000000000000000000000") return; // skip mints
    ctx.spawnFromNFT(tokenId.toString()).catch(console.error);
  });
}
