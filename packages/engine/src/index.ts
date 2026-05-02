import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { loadEnvironment, skillResolvesCrisis } from "@moirai/environment";
import { loadPersonality } from "@moirai/personality";
import type { Event, Crisis, Skill } from "@moirai/shared";
import type { AgentEntry, SkillEntry } from "./types.js";
import {
  inftAdapter, marketplaceAdapter, INFT_ENABLED, WORLD_ID,
  buildMetadata, startContractListeners,
} from "./inft.js";
import { startHttpServer } from "./http.js";

const TICK_MS = parseInt(process.env["TICK_MS"] ?? "2000");
const WS_PORT = parseInt(process.env["WS_PORT"] ?? "8765");
const HTTP_PORT = parseInt(process.env["HTTP_PORT"] ?? "8766");
const AGENT_RUNTIME_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../agent-runtime");
const KEYS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../docker/axl/keys");
const AVATARS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../web/src/assets/agents");

const AXL_URLS = [
  process.env["AXL_URL_1"] ?? "http://127.0.0.1:19002",
  process.env["AXL_URL_2"] ?? "http://127.0.0.1:19012",
  process.env["AXL_URL_3"] ?? "http://127.0.0.1:19022",
];
const AXL_KEY_PATHS: Record<string, string> = {
  [AXL_URLS[0]!]: join(KEYS_DIR, "alice.pem"),
  [AXL_URLS[1]!]: join(KEYS_DIR, "bob.pem"),
  [AXL_URLS[2]!]: join(KEYS_DIR, "charlie.pem"),
};

if (INFT_ENABLED) {
  console.log(`[engine] iNFT enabled — world=${WORLD_ID}`);
} else {
  console.log("[engine] iNFT disabled (set INFT_CONTRACT_ADDRESS, MARKETPLACE_CONTRACT_ADDRESS, ZG_PRIVATE_KEY, ZG_RPC_URL, ZG_INDEXER_URL to enable)");
}

const environment = loadEnvironment();
const allEvents: Event[] = [];
const skills = new Map<string, SkillEntry>();
let tick = 0;
let paused = false;


function makeSkillStub(s: { id: string; name: string }): Skill {
  return {
    id: s.id, name: s.name, description: "", preconditions: [], effect: "", steps: [],
    provenance: { inventedBy: "inherited", inventedAt: 0, bornFrom: [], reasonReceipt: "", selfEvalReceipt: "", selfEvalScore: 0 },
  };
}

// --- WebSocket broadcaster ---
const wss = new WebSocketServer({ port: WS_PORT });
console.log(`[engine] WebSocket listening on :${WS_PORT}`);

wss.on("connection", (ws) => {
  for (const ev of allEvents) {
    if ((ws as WebSocket).readyState === WebSocket.OPEN) {
      (ws as WebSocket).send(JSON.stringify(ev));
    }
  }
  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString()) as { kind: string; agentId?: string; tokenId?: string; salePriceWei?: string };
      if (msg.kind === "PAUSE") { paused = true; console.log("[engine] world PAUSED"); }
      else if (msg.kind === "RESUME") { paused = false; console.log("[engine] world RESUMED"); }
      else if (msg.kind === "MARKETPLACE_LIST" && inftAdapter && marketplaceAdapter) {
        const { agentId: targetId, tokenId, salePriceWei } = msg;
        if (!targetId || !tokenId || !salePriceWei) return;
        const entry = agents.get(targetId);
        if (!entry) { broadcast({ kind: "MARKETPLACE_ERROR", tick, actorId: targetId, payload: { message: "agent not found" } } as unknown as Event); return; }
        console.log(`[engine] [marketplace] list requested agentId=${targetId} tokenId=${tokenId}`);
        marketplaceAdapter.list(tokenId, BigInt(salePriceWei), WORLD_ID).then(() => {
          entry.listed = true;
          broadcast({ kind: "AGENT_LISTED", tick, actorId: targetId, payload: { tokenId, salePriceWei } });
          broadcastListings();
        }).catch((err: unknown) => {
          console.error("[engine] marketplace list failed:", err);
          broadcast({ kind: "MARKETPLACE_ERROR", tick, actorId: targetId, payload: { message: String(err) } } as unknown as Event);
        });
      }
      else if (msg.kind === "MARKETPLACE_DELIST" && marketplaceAdapter) {
        const { agentId: targetId, tokenId } = msg;
        if (!targetId || !tokenId) return;
        const entry = agents.get(targetId);
        console.log(`[engine] [marketplace] delist requested agentId=${targetId} tokenId=${tokenId}`);
        marketplaceAdapter.delist(tokenId).then(() => {
          if (entry) entry.listed = false;
          broadcast({ kind: "AGENT_DELISTED", tick, actorId: targetId, payload: { tokenId, reason: "manual" } });
          broadcastListings();
        }).catch((err: unknown) => {
          console.error("[engine] marketplace delist failed:", err);
          broadcast({ kind: "MARKETPLACE_ERROR", tick, actorId: targetId, payload: { message: String(err) } } as unknown as Event);
        });
      }
      else if (msg.kind === "MARKETPLACE_GET_LISTINGS") {
        broadcastListings();
      }
      else if (msg.kind === "MARKETPLACE_IMPORT" && marketplaceAdapter) {
        const { tokenId, salePriceWei } = msg as { kind: string; tokenId?: string; salePriceWei?: string };
        if (!tokenId || !salePriceWei) return;
        console.log(`[engine] [marketplace] import requested tokenId=${tokenId}`);
        marketplaceAdapter.buy(tokenId, BigInt(salePriceWei))
          .then(() => {
            console.log(`[engine] [marketplace] bought tokenId=${tokenId} — waiting for Transfer event to spawn`);
            broadcastListings();
          })
          .catch((err: unknown) => {
            console.error("[engine] marketplace buy failed:", err);
            broadcast({ kind: "MARKETPLACE_ERROR", tick, actorId: "engine", payload: { message: String(err), tokenId } } as unknown as Event);
          });
      }
      else if (msg.kind === "MARKETPLACE_CLEAN" && marketplaceAdapter && inftAdapter) {
        cleanOwnListings().then(broadcastListings).catch(console.error);
      }
    } catch { /* ignore malformed */ }
  });
});

function broadcast(event: Event): void {
  allEvents.push(event);
  const msg = JSON.stringify(event);
  for (const client of wss.clients) {
    if ((client as WebSocket).readyState === WebSocket.OPEN) {
      (client as WebSocket).send(msg);
    }
  }
}

function pushToClients(msg: unknown): void {
  const str = JSON.stringify(msg);
  for (const client of wss.clients) {
    if ((client as WebSocket).readyState === WebSocket.OPEN) {
      (client as WebSocket).send(str);
    }
  }
}

async function cleanOwnListings(): Promise<void> {
  if (!marketplaceAdapter || !inftAdapter) return;
  const [listings, ownedTokenIds] = await Promise.all([
    marketplaceAdapter.getActiveListings(),
    inftAdapter.getOwnedTokenIds(),
  ]);
  const ownedSet = new Set(ownedTokenIds);
  const stale = listings.filter(l => ownedSet.has(l.tokenId));
  if (stale.length === 0) return;
  console.log(`[engine] [marketplace] cleaning ${stale.length} stale own listing(s)…`);
  for (const l of stale) {
    await marketplaceAdapter!.delist(l.tokenId)
      .then(() => console.log(`[engine] [marketplace] cleaned tokenId=${l.tokenId}`))
      .catch((err: unknown) => console.error(`[engine] [marketplace] delist failed tokenId=${l.tokenId}:`, err));
  }
}

function broadcastListings(): void {
  if (!marketplaceAdapter) return;
  marketplaceAdapter.getActiveListings().then(async (rawListings) => {
    // Deduplicate by tokenId — contract bug can produce duplicate entries
    const seen = new Map<string, typeof rawListings[number]>();
    for (const l of rawListings) seen.set(l.tokenId, l);
    const listings = [...seen.values()];
    const enriched = await Promise.all(listings.map(async (l) => {
      const base = { ...l, salePriceWei: l.salePriceWei.toString() };
      if (!inftAdapter) return base;
      try {
        const meta = await inftAdapter.readMetadata(l.tokenId);
        const localEntry = [...agents.values()].find(a => a.tokenId === l.tokenId);
        const liveSkills = localEntry
          ? [...localEntry.knownSkillIds].map(sid => ({ id: sid, name: skills.get(sid)?.skill.name ?? sid }))
          : meta.skills.map(s => ({ id: s.id, name: s.name }));
        return { ...base, name: meta.name, traits: meta.traits, image: meta.image, skills: liveSkills };
      } catch {
        return base;
      }
    }));
    pushToClients({ kind: "MARKETPLACE_LISTINGS", tick, actorId: "engine", payload: { listings: enriched } });
  }).catch(console.error);
}

// --- Agent process tracking ---
const agents = new Map<string, AgentEntry>();
let axlUrlIdx = 0;

function sendToAgent(entry: AgentEntry, msg: unknown): void {
  try {
    if (entry.alive) entry.proc.stdin!.write(JSON.stringify(msg) + "\n");
  } catch { /* process may have exited */ }
}

const REPLACEMENT_POOL = ["dave", "eve", "frank", "grace", "henry"];
let replacementIdx = 0;

function spawnAgent(
  id: string,
  inheritedSkillRoots: Record<string, string> = {},
  ancestorDeaths: Array<{ agentId: string; reason: string }> = [],
  ancestorTokenIds: string[] = [],
  existingTokenId?: string,
  nftIdentity?: { name: string; traits: string[]; personalityId: string; image: string },
): void {
  const axlUrl = AXL_URLS[axlUrlIdx++ % AXL_URLS.length]!;
  const axlKeyPath = AXL_KEY_PATHS[axlUrl] ?? "";
  const personalityId = nftIdentity?.personalityId ?? id;
  const proc = spawn("node", ["--import", "tsx/esm", "src/index.ts"], {
    cwd: AGENT_RUNTIME_DIR,
    stdio: ["pipe", "pipe", "inherit"],
    env: { ...process.env, AGENT_ID: id, PERSONALITY_ID: personalityId, AXL_URL: axlUrl, AXL_KEY_PATH: axlKeyPath },
  });

  const personality = loadPersonality(personalityId);
  const entry: AgentEntry = {
    id,
    ...(nftIdentity ? { personalityId } : {}),
    ...(nftIdentity?.image ? { image: nftIdentity.image } : {}),
    proc, alive: true, knownSkillIds: new Set(),
    hunger: 0, listed: false, sold: false,
    ...(personality.hunger ? { hungerConfig: personality.hunger } : {}),
  };
  agents.set(id, entry);

  sendToAgent(entry, { kind: "BOOT", peerIds: [...agents.keys()], inheritedSkillRoots, ...(ancestorDeaths.length ? { ancestorDeaths } : {}) });

  // iNFT: marketplace import | wallet reuse | fresh mint
  if (inftAdapter) {
    if (existingTokenId) {
      // Token from another engine — marketplace import
      entry.tokenId = existingTokenId;
      console.log(`[engine] [iNFT] ${id}: imported from marketplace tokenId=${existingTokenId} skills=${Object.keys(inheritedSkillRoots).length}`);
      broadcast({ kind: "AGENT_IMPORTED", tick, actorId: id, payload: { tokenId: existingTokenId, skills: Object.keys(inheritedSkillRoots) } });
    } else {
      // Always mint fresh on engine start
      console.log(`[engine] [iNFT] ${id}: minting new NFT…`);
      readFile(join(AVATARS_DIR, `${personalityId}.svg`))
        .then((bytes) => {
          entry.image = `data:image/svg+xml;base64,${bytes.toString("base64")}`;
          return inftAdapter!.mint(id, buildMetadata(entry, skills, tick));
        })
        .then((tokenId) => {
          entry.tokenId = tokenId;
          console.log(`[engine] [iNFT] ${id}: minted tokenId=${tokenId}`);
          broadcast({ kind: "AGENT_MINTED", tick, actorId: id, payload: { tokenId } });
        }).catch(console.error);
    }
  }

  const rl = createInterface({ input: proc.stdout! });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(trimmed) as Record<string, unknown>; } catch { return; }

    if (msg["_kind"] === "META_SKILL_ROOT") {
      const skillId = msg["skillId"] as string;
      const rootHash = msg["rootHash"] as string;
      const existing = skills.get(skillId);
      if (existing) skills.set(skillId, { ...existing, rootHash });
      return;
    }

    const event = msg as unknown as Event;

    if (event.kind === "SKILL_ACCEPTED") {
      entry.knownSkillIds.add(event.payload.skill.id);
      skills.set(event.payload.skill.id, { skill: event.payload.skill, rootHash: "" });
      if (inftAdapter && entry.tokenId) {
        inftAdapter.updateMetadata(entry.tokenId, buildMetadata(entry, skills, tick)).catch(console.error);
      }
    }
    if (event.kind === "SKILL_LEARNED" || event.kind === "SKILL_INHERITED") {
      entry.knownSkillIds.add(event.payload.skillId);
    }
    if (event.kind === "REASONING_STARTED" && entry.listed && entry.tokenId && marketplaceAdapter) {
      entry.listed = false;
      marketplaceAdapter.delist(entry.tokenId).catch(console.error);
      broadcast({ kind: "AGENT_DELISTED", tick, actorId: id, payload: { tokenId: entry.tokenId, reason: "reasoning" } });
    }

    broadcast(event);
    checkCrisisResolution(id);
  });

  proc.on("exit", (code) => {
    const wasAlive = entry.alive;
    entry.alive = false;
    if (wasAlive) {
      broadcast({ kind: "AGENT_DIED", tick, actorId: id, payload: { reason: code === 0 ? "natural" : `exit ${code}` } });
    }

    if (inftAdapter && entry.tokenId && !entry.sold) {
      console.log(`[engine] [iNFT] ${id}: died — setting dormant tokenId=${entry.tokenId}`);
      const dormantMeta = buildMetadata(entry, skills, tick);
      dormantMeta.status = "dormant";
      dormantMeta.deathTick = tick;
      dormantMeta.deathReason = code === 0 ? "natural" : `exit ${code}`;
      inftAdapter.setDormant(entry.tokenId, dormantMeta).catch(console.error);
    }

    if (entry.sold) return;

    if (replacementIdx < REPLACEMENT_POOL.length) {
      const nextId = REPLACEMENT_POOL[replacementIdx++]!;
      const inheritedSkillRoots: Record<string, string> = {};
      for (const skillId of entry.knownSkillIds) {
        const s = skills.get(skillId);
        if (s?.rootHash) inheritedSkillRoots[skillId] = s.rootHash;
      }
      const ancestorTokenIds = entry.tokenId ? [entry.tokenId] : [];
      setTimeout(() => {
        spawnAgent(nextId, inheritedSkillRoots, [{ agentId: id, reason: code === 0 ? "hunger" : `exit code ${code}` }], ancestorTokenIds);
        broadcastPeerList();
      }, 3 * TICK_MS);
    }
  });

  const spawnedName = nftIdentity?.name ?? personality.name;
  const spawnedTraits = nftIdentity?.traits ?? personality.traits ?? [];
  const spawnedImage = nftIdentity?.image ?? entry.image;
  broadcast({ kind: "AGENT_SPAWNED", tick, actorId: id, payload: { personalityId, name: spawnedName, traits: spawnedTraits, ...(spawnedImage ? { image: spawnedImage } : {}) } });
}

async function spawnFromNFT(tokenId: string): Promise<string | null> {
  if (!inftAdapter) return null;
  console.log(`[engine] [iNFT] spawnFromNFT: tokenId=${tokenId} — reading metadata…`);
  const metadata = await inftAdapter.readMetadata(tokenId);
  // Unique runtime id: personalityId-tokenId avoids collisions with local agents
  const uniqueId = `${metadata.personalityId}-${tokenId}`;
  console.log(`[engine] [iNFT] spawnFromNFT: uniqueId=${uniqueId} skills=${metadata.skills.length}`);
  // Pre-populate the skills Map so buildMetadata always writes the full cumulative set
  for (const s of metadata.skills) {
    if (!skills.has(s.id)) {
      skills.set(s.id, { skill: makeSkillStub(s), rootHash: s.rootHash });
      console.log(`[engine] [iNFT] pre-populated skill stub: ${s.id} (${s.name})`);
    }
  }
  const inheritedSkillRoots = Object.fromEntries(metadata.skills.map((s) => [s.id, s.rootHash]));
  const nftIdentity = { name: metadata.name, traits: metadata.traits, personalityId: metadata.personalityId, image: metadata.image };
  spawnAgent(uniqueId, inheritedSkillRoots, [], [...metadata.ancestorTokenIds, tokenId], tokenId, nftIdentity);
  return uniqueId;
}

function broadcastPeerList(): void {
  const allIds = [...agents.keys()];
  for (const agent of agents.values()) {
    if (!agent.alive) continue;
    sendToAgent(agent, { kind: "PEERS", peerIds: allIds.filter((id) => id !== agent.id) });
  }
}

// --- Crisis tracking ---
const activeCrises = new Map<string, Crisis>();
const resolvedCrises = new Set<string>();
const perCrisisResolvedAgents = new Map<string, Set<string>>();

function agentCanResolve(agentId: string, crisis: Crisis): boolean {
  const agent = agents.get(agentId);
  if (!agent) return false;
  for (const skillId of agent.knownSkillIds) {
    const s = skills.get(skillId);
    if (s && skillResolvesCrisis(s.skill, crisis, environment)) return true;
  }
  return false;
}

function checkCrisisResolution(agentId: string): void {
  for (const [crisisId, crisis] of activeCrises) {
    if (resolvedCrises.has(crisisId)) continue;
    if (!crisis.targets.includes(agentId)) continue;

    if (agentCanResolve(agentId, crisis)) {
      const set = perCrisisResolvedAgents.get(crisisId) ?? new Set<string>();
      set.add(agentId);
      perCrisisResolvedAgents.set(crisisId, set);
    }

    const allResolved = crisis.targets.every((targetId) => {
      const a = agents.get(targetId);
      return !a?.alive || agentCanResolve(targetId, crisis);
    });

    if (allResolved) {
      resolvedCrises.add(crisisId);
      activeCrises.delete(crisisId);
      perCrisisResolvedAgents.delete(crisisId);
      const survived = crisis.targets.filter(id => agents.get(id)?.alive);
      const died = crisis.targets.filter(id => !agents.get(id)?.alive);
      const totalAlive = [...agents.values()].filter(a => a.alive).length;
      broadcast({ kind: "CRISIS_RESOLVED", tick, actorId: "engine", payload: { crisisId, survived, died, totalAlive } });
    }
  }
}

// --- Tick loop ---
function doTick(): void {
  if (paused) return;
  tick++;
  broadcast({ kind: "WORLD_TICK", tick, actorId: "engine" });

  for (const agent of agents.values()) {
    if (!agent.alive || !agent.hungerConfig) continue;
    agent.hunger += agent.hungerConfig.rate;
    broadcast({ kind: "AGENT_HUNGER", tick, actorId: agent.id, payload: { hunger: agent.hunger, threshold: agent.hungerConfig.threshold } });
    if (agent.hunger >= agent.hungerConfig.threshold) {
      agent.proc.stdin!.write(JSON.stringify({ kind: "DIE", reason: "hunger" }) + "\n");
      agent.alive = false;
      broadcast({ kind: "AGENT_DIED", tick, actorId: agent.id, payload: { reason: "hunger" } });
    }
  }

  for (const [crisisId, crisis] of [...activeCrises]) {
    if (resolvedCrises.has(crisisId)) continue;
    if (tick < crisis.startedAtTick + crisis.deadlineTicks) continue;

    const survived: string[] = [];
    const killed: string[] = [];
    const individuallyResolved = perCrisisResolvedAgents.get(crisisId) ?? new Set<string>();

    for (const targetId of crisis.targets) {
      const agent = agents.get(targetId);
      if (!agent?.alive) continue;
      if (individuallyResolved.has(targetId)) {
        survived.push(targetId);
      } else {
        killed.push(targetId);
        agent.proc.stdin!.write(JSON.stringify({ kind: "DIE", reason: `crisis:${crisis.type}` }) + "\n");
        agent.alive = false;
        broadcast({ kind: "AGENT_DIED", tick, actorId: targetId, payload: { reason: `crisis:${crisis.type}` } });
      }
    }

    resolvedCrises.add(crisisId);
    activeCrises.delete(crisisId);
    perCrisisResolvedAgents.delete(crisisId);
    broadcast({ kind: "CRISIS_OVER", tick, actorId: "engine", payload: { crisisId, survived, killed } });
  }

  const newCrisesByAgent = new Map<string, Crisis[]>();
  for (const entry of environment.crisisSchedule) {
    if (entry.tick !== tick) continue;
    const crisisId = `${entry.type}-${tick}`;
    const targets = (entry.targets ?? [...agents.keys()]).filter(id => agents.get(id)?.alive);
    const crisis: Crisis = {
      id: crisisId, type: entry.type,
      description: entry.type === "LION"
        ? "A lion appears, threatening nearby agents!"
        : entry.type === "HUNGER"
          ? "You are starving and must find food to survive before it's too late!"
          : `A ${entry.type.toLowerCase()} crisis strikes!`,
      startedAtTick: tick, deadlineTicks: entry.deadlineTicks, targets,
    };
    activeCrises.set(crisisId, crisis);
    broadcast({ kind: "CRISIS_STARTED", tick, actorId: "engine", payload: crisis });
    for (const targetId of targets) {
      const list = newCrisesByAgent.get(targetId) ?? [];
      list.push(crisis);
      newCrisesByAgent.set(targetId, list);
    }
  }

  for (const agent of agents.values()) {
    if (!agent.alive) continue;
    sendToAgent(agent, { kind: "TICK", tick, crises: newCrisesByAgent.get(agent.id) ?? [] });
  }
}

// --- Boot ---
async function main(): Promise<void> {
  startHttpServer({
    port: HTTP_PORT,
    agents, skills, activeCrises, resolvedCrises,
    broadcast, sendToAgent,
    getTick: () => tick,
    spawnFromNFT,
  });

  startContractListeners({
    agents, broadcast,
    getTick: () => tick,
    spawnFromNFT,
  });

  if (INFT_ENABLED && inftAdapter) {
    if (marketplaceAdapter && process.env["MARKETPLACE_CONTRACT_ADDRESS"]) {
      await inftAdapter.approveMarketplaceForAll(process.env["MARKETPLACE_CONTRACT_ADDRESS"]).catch(console.error);
    }
    // Delist any stale listings left over from a previous engine session
    await cleanOwnListings().catch(console.error);
  }

  const initialAgents = ["alice", "bob", "charlie"];
  for (const id of initialAgents) {
    spawnAgent(id);
    await new Promise((r) => setTimeout(r, 300));
  }

  broadcastPeerList();
  console.log(`[engine] tick loop started (${TICK_MS}ms per tick)`);
  setInterval(doTick, TICK_MS);
}

main().catch(console.error);
