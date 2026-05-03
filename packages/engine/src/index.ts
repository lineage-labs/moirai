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
  inftAdapter,
  marketplaceAdapter,
  INFT_ENABLED,
  WORLD_ID,
  buildMetadata,
  minifySvg,
  startContractListeners,
} from "./inft.js";
import { startHttpServer } from "./http.js";

const TICK_MS = parseInt(process.env["TICK_MS"] ?? "2000");
const WS_PORT = parseInt(process.env["WS_PORT"] ?? "8765");
const HTTP_PORT = parseInt(process.env["HTTP_PORT"] ?? "8766");
const AGENT_RUNTIME_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../agent-runtime",
);
const KEYS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../docker/axl/keys",
);
const AVATARS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../web/src/assets/agents",
);

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
  console.log(
    "[engine] iNFT disabled (set INFT_CONTRACT_ADDRESS, MARKETPLACE_CONTRACT_ADDRESS, ZG_PRIVATE_KEY, ZG_RPC_URL, ZG_INDEXER_URL to enable)",
  );
}

const environment = loadEnvironment();
const allEvents: Event[] = [];
const skills = new Map<string, SkillEntry>();
let tick = 0;
let paused = false;

function makeSkillStub(s: { id: string; name: string }): Skill {
  return {
    id: s.id,
    name: s.name,
    description: "",
    preconditions: [],
    effect: "",
    steps: [],
    provenance: {
      inventedBy: "inherited",
      inventedAt: 0,
      bornFrom: [],
      reasonReceipt: "",
      selfEvalReceipt: "",
      selfEvalScore: 0,
    },
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
      const msg = JSON.parse(data.toString()) as {
        kind: string;
        agentId?: string;
        tokenId?: string;
        salePriceWei?: string;
      };
      if (msg.kind === "PAUSE") {
        paused = true;
        console.log("[engine] world PAUSED");
      } else if (msg.kind === "RESUME") {
        paused = false;
        console.log("[engine] world RESUMED");
      } else if (
        msg.kind === "MARKETPLACE_LIST" &&
        inftAdapter &&
        marketplaceAdapter
      ) {
        const { agentId: targetId, tokenId, salePriceWei } = msg;
        if (!targetId || !tokenId || !salePriceWei) return;
        const entry = agents.get(targetId);
        if (!entry) {
          broadcast({
            kind: "MARKETPLACE_ERROR",
            tick,
            actorId: targetId,
            payload: { message: "agent not found" },
          } as unknown as Event);
          return;
        }
        console.log(
          `[engine] [marketplace] list requested agentId=${targetId} tokenId=${tokenId}`,
        );
        inftAdapter
          .enqueueWrite(() =>
            marketplaceAdapter!.list(tokenId, BigInt(salePriceWei), WORLD_ID),
          )
          .then(() => {
            entry.listed = true;
            broadcast({
              kind: "AGENT_LISTED",
              tick,
              actorId: targetId,
              payload: { tokenId, salePriceWei },
            });
            broadcastListings();
          })
          .catch((err: unknown) => {
            console.error("[engine] marketplace list failed:", err);
            broadcast({
              kind: "MARKETPLACE_ERROR",
              tick,
              actorId: targetId,
              payload: { message: String(err) },
            } as unknown as Event);
          });
      } else if (
        msg.kind === "MARKETPLACE_DELIST" &&
        marketplaceAdapter &&
        inftAdapter
      ) {
        const { agentId: targetId, tokenId } = msg;
        if (!targetId || !tokenId) return;
        const entry = agents.get(targetId);
        console.log(
          `[engine] [marketplace] delist requested agentId=${targetId} tokenId=${tokenId}`,
        );
        inftAdapter
          .enqueueWrite(() => marketplaceAdapter!.delist(tokenId))
          .then(() => {
            if (entry) entry.listed = false;
            broadcast({
              kind: "AGENT_DELISTED",
              tick,
              actorId: targetId,
              payload: { tokenId, reason: "manual" },
            });
            broadcastListings();
          })
          .catch((err: unknown) => {
            console.error("[engine] marketplace delist failed:", err);
            broadcast({
              kind: "MARKETPLACE_ERROR",
              tick,
              actorId: targetId,
              payload: { message: String(err) },
            } as unknown as Event);
          });
      } else if (msg.kind === "MARKETPLACE_GET_LISTINGS") {
        broadcastListings();
      } else if (
        msg.kind === "MARKETPLACE_IMPORT" &&
        marketplaceAdapter &&
        inftAdapter
      ) {
        const { tokenId, salePriceWei } = msg as {
          kind: string;
          tokenId?: string;
          salePriceWei?: string;
        };
        if (!tokenId || !salePriceWei) return;
        console.log(
          `[engine] [marketplace] import requested tokenId=${tokenId}`,
        );
        inftAdapter
          .enqueueWrite(() =>
            marketplaceAdapter!.buy(tokenId, BigInt(salePriceWei)),
          )
          .then(() => {
            console.log(
              `[engine] [marketplace] bought tokenId=${tokenId} — waiting for Transfer event to spawn`,
            );
            broadcastListings();
          })
          .catch((err: unknown) => {
            console.error("[engine] marketplace buy failed:", err);
            broadcast({
              kind: "MARKETPLACE_ERROR",
              tick,
              actorId: "engine",
              payload: { message: String(err), tokenId },
            } as unknown as Event);
          });
      } else if (
        msg.kind === "MARKETPLACE_CLEAN" &&
        marketplaceAdapter &&
        inftAdapter
      ) {
        cleanOwnListings().then(broadcastListings).catch(console.error);
      }
    } catch {
      /* ignore malformed */
    }
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
  const stale = listings.filter((l) => ownedSet.has(l.tokenId));
  if (stale.length === 0) return;
  console.log(
    `[engine] [marketplace] cleaning ${stale.length} stale own listing(s)…`,
  );
  for (const l of stale) {
    await inftAdapter!
      .enqueueWrite(() => marketplaceAdapter!.delist(l.tokenId))
      .then(() =>
        console.log(`[engine] [marketplace] cleaned tokenId=${l.tokenId}`),
      )
      .catch((err: unknown) =>
        console.error(
          `[engine] [marketplace] delist failed tokenId=${l.tokenId}:`,
          err,
        ),
      );
  }
}

function broadcastListings(): void {
  if (!marketplaceAdapter) return;
  marketplaceAdapter
    .getActiveListings()
    .then(async (rawListings) => {
      // Deduplicate by tokenId — contract bug can produce duplicate entries
      const seen = new Map<string, (typeof rawListings)[number]>();
      for (const l of rawListings) seen.set(l.tokenId, l);
      const listings = [...seen.values()];
      const enriched = await Promise.all(
        listings.map(async (l) => {
          const base = { ...l, salePriceWei: l.salePriceWei.toString() };
          if (!inftAdapter) return base;
          try {
            const meta = await inftAdapter.readMetadata(l.tokenId);
            // Hydrate each skill referenced by the NFT: rootHash from metadata → JSON from 0G Storage.
            // Cache in the engine-wide `skills` map so future reads hit memory.
            const hydrated = await Promise.all(
              meta.skills.map(async (s) => {
                const cached = skills.get(s.id);
                if (cached?.skill.description) return cached.skill;
                if (!s.rootHash) return makeSkillStub(s);
                try {
                  const skill = await inftAdapter!.downloadJson<Skill>(
                    s.rootHash,
                  );
                  skills.set(s.id, { skill, rootHash: s.rootHash });
                  return skill;
                } catch (err) {
                  console.error(
                    `[engine] downloadJson failed for skill=${s.id} rootHash=${s.rootHash}:`,
                    err,
                  );
                  return makeSkillStub(s);
                }
              }),
            );
            return {
              ...base,
              name: meta.name,
              traits: meta.traits,
              image: meta.image,
              skills: hydrated.map((s) => ({ id: s.id, name: s.name })),
            };
          } catch (err) {
            console.error(
              `[engine] readMetadata failed for tokenId=${l.tokenId}:`,
              err,
            );
            return base;
          }
        }),
      );
      pushToClients({
        kind: "MARKETPLACE_LISTINGS",
        tick,
        actorId: "engine",
        payload: { listings: enriched },
      });
    })
    .catch(console.error);
}

// --- Agent process tracking ---
const agents = new Map<string, AgentEntry>();
let axlUrlIdx = 0;

function sendToAgent(entry: AgentEntry, msg: unknown): void {
  try {
    if (entry.alive) entry.proc.stdin!.write(JSON.stringify(msg) + "\n");
  } catch {
    /* process may have exited */
  }
}

const REPLACEMENT_POOL = ["dave", "eve", "frank", "grace", "henry"];
let replacementIdx = 0;

function spawnAgent(
  id: string,
  inheritedSkillRoots: Record<string, string> = {},
  ancestorDeaths: Array<{ agentId: string; reason: string }> = [],
  ancestorTokenIds: string[] = [],
  existingTokenId?: string,
  nftIdentity?: {
    name: string;
    traits: string[];
    personalityId: string;
    image: string;
  },
): void {
  const axlUrl = AXL_URLS[axlUrlIdx++ % AXL_URLS.length]!;
  const axlKeyPath = AXL_KEY_PATHS[axlUrl] ?? "";
  const personalityId = nftIdentity?.personalityId ?? id;
  const proc = spawn("node", ["--import", "tsx/esm", "src/index.ts"], {
    cwd: AGENT_RUNTIME_DIR,
    stdio: ["pipe", "pipe", "inherit"],
    env: {
      ...process.env,
      AGENT_ID: id,
      PERSONALITY_ID: personalityId,
      AXL_URL: axlUrl,
      AXL_KEY_PATH: axlKeyPath,
    },
  });

  const personality = loadPersonality(personalityId);
  // Hunger ticks only on the original local agents — not on imported NFT clones.
  // An imported agent shares its personality (alice/charlie) with a local one, so loading
  // hungerConfig for it would inject a second hunger crisis for the same name. Imported
  // agents are showcases of bought NFTs; the hunger game mechanic stays with the originals.
  const isImported = !!nftIdentity;
  const entry: AgentEntry = {
    id,
    ...(nftIdentity ? { personalityId } : {}),
    ...(nftIdentity?.image ? { image: nftIdentity.image } : {}),
    proc,
    alive: true,
    knownSkillIds: new Set(),
    hunger: 0,
    listed: false,
    sold: false,
    ...(personality.hunger && !isImported
      ? { hungerConfig: personality.hunger }
      : {}),
  };
  agents.set(id, entry);

  sendToAgent(entry, {
    kind: "BOOT",
    peerIds: [...agents.values()].filter((a) => a.alive).map((a) => a.id),
    inheritedSkillRoots,
    ...(ancestorDeaths.length ? { ancestorDeaths } : {}),
  });

  // iNFT: marketplace import | fresh mint
  if (inftAdapter) {
    const contractAddress = process.env["INFT_CONTRACT_ADDRESS"];
    const contractAddressField = contractAddress ? { contractAddress } : {};
    if (existingTokenId) {
      // Token from another engine — marketplace import
      entry.tokenId = existingTokenId;
      console.log(
        `[engine] [iNFT] ${id}: imported from marketplace tokenId=${existingTokenId} skills=${
          Object.keys(inheritedSkillRoots).length
        }`,
      );
      broadcast({
        kind: "AGENT_IMPORTED",
        tick,
        actorId: id,
        payload: {
          tokenId: existingTokenId,
          skills: Object.keys(inheritedSkillRoots),
          ...contractAddressField,
        },
      });
    } else {
      // Always mint fresh on engine start
      console.log(`[engine] [iNFT] ${id}: minting new NFT…`);
      readFile(join(AVATARS_DIR, `${personalityId}.svg`))
        .then((bytes) => {
          entry.image = `data:image/svg+xml;base64,${Buffer.from(
            minifySvg(bytes.toString("utf8")),
          ).toString("base64")}`;
          return inftAdapter!.mint(id, buildMetadata(entry, skills, tick));
        })
        .then((tokenId) => {
          entry.tokenId = tokenId;
          console.log(`[engine] [iNFT] ${id}: minted tokenId=${tokenId}`);
          broadcast({
            kind: "AGENT_MINTED",
            tick,
            actorId: id,
            payload: { tokenId, ...contractAddressField },
          });
          // Flush: any skills learned during mint were skipped (entry.tokenId was undefined).
          // Push them now so the on-chain metadata reflects current state.
          if (entry.knownSkillIds.size > 0 && inftAdapter) {
            inftAdapter
              .updateMetadata(tokenId, buildMetadata(entry, skills, tick))
              .catch(console.error);
          }
        })
        .catch(console.error);
    }
  }

  const rl = createInterface({ input: proc.stdout! });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return;
    }

    if (msg["_kind"] === "META_SKILL_ROOT") {
      const skillId = msg["skillId"] as string;
      const rootHash = msg["rootHash"] as string;
      const skillName = msg["skillName"] as string | undefined;
      const existing = skills.get(skillId);
      if (existing) {
        skills.set(skillId, { ...existing, rootHash });
        // Persist NFT update right away — invent path lands here last.
        if (inftAdapter && entry.tokenId) {
          inftAdapter
            .updateMetadata(entry.tokenId, buildMetadata(entry, skills, tick))
            .catch(console.error);
        }
      } else if (rootHash && inftAdapter) {
        // Cross-engine skill — fetch the real Skill from 0G, then update NFT.
        // Insert a stub keyed by name so buildMetadata can emit it even before download finishes.
        if (skillName) {
          skills.set(skillId, {
            skill: makeSkillStub({ id: skillId, name: skillName }),
            rootHash,
          });
        }
        inftAdapter
          .downloadJson<Skill>(rootHash)
          .then((skill) => {
            skills.set(skillId, { skill, rootHash });
            if (inftAdapter && entry.tokenId) {
              return inftAdapter.updateMetadata(
                entry.tokenId,
                buildMetadata(entry, skills, tick),
              );
            }
            return undefined;
          })
          .catch((err) =>
            console.error(
              `[engine] downloadJson failed for skill=${skillId} rootHash=${rootHash}:`,
              err,
            ),
          );
      }
      return;
    }

    const event = msg as unknown as Event;

    if (event.kind === "SKILL_ACCEPTED") {
      const skillId = event.payload.skill.id;
      const acceptedRoot = event.payload.rootHash ?? "";
      entry.knownSkillIds.add(skillId);
      // Preserve any rootHash already known for this skill (e.g. set by a peer's META_SKILL_ROOT
      // that arrived first via cross-engine TEACH).
      const prior = skills.get(skillId);
      const rootHash = acceptedRoot || prior?.rootHash || "";
      skills.set(skillId, { skill: event.payload.skill, rootHash });
      // Persist NFT update immediately when rootHash is known — the invent path no longer
      // depends on a separate META_SKILL_ROOT line arriving in time.
      if (rootHash && inftAdapter && entry.tokenId) {
        inftAdapter
          .updateMetadata(entry.tokenId, buildMetadata(entry, skills, tick))
          .catch(console.error);
      }
    }
    if (event.kind === "SKILL_LEARNED" || event.kind === "SKILL_INHERITED") {
      entry.knownSkillIds.add(event.payload.skillId);
      // updateMetadata is fired by the META_SKILL_ROOT message that follows.
    }
    if (event.kind === "AGENT_RESCUED") {
      // Trust the agent's self-eval (already validated via sealed 0G inference).
      // Mark the crisis resolved — same model as lion. No manual hunger decrement;
      // closing the crisis is what saves the agent (deadline check below has nothing to act on).
      const crisisId = event.payload.crisisId;
      const crisis = activeCrises.get(crisisId);
      if (crisis) {
        const set = perCrisisResolvedAgents.get(crisisId) ?? new Set<string>();
        set.add(entry.id);
        perCrisisResolvedAgents.set(crisisId, set);
        const allResolved = crisis.targets.every((targetId) => {
          const a = agents.get(targetId);
          return (
            !a?.alive || set.has(targetId) || agentCanResolve(targetId, crisis)
          );
        });
        if (allResolved) {
          resolvedCrises.add(crisisId);
          activeCrises.delete(crisisId);
          perCrisisResolvedAgents.delete(crisisId);
          const survived = crisis.targets.filter(
            (tid) => agents.get(tid)?.alive,
          );
          const died = crisis.targets.filter((tid) => !agents.get(tid)?.alive);
          const totalAlive = [...agents.values()].filter((a) => a.alive).length;
          broadcast({
            kind: "CRISIS_RESOLVED",
            tick,
            actorId: "engine",
            payload: { crisisId, survived, died, totalAlive },
          });
        }
      }
    }
    if (
      event.kind === "REASONING_STARTED" &&
      entry.listed &&
      entry.tokenId &&
      marketplaceAdapter &&
      inftAdapter
    ) {
      entry.listed = false;
      const tokenId = entry.tokenId;
      inftAdapter
        .enqueueWrite(() => marketplaceAdapter!.delist(tokenId))
        .catch(console.error);
      broadcast({
        kind: "AGENT_DELISTED",
        tick,
        actorId: id,
        payload: { tokenId: entry.tokenId, reason: "reasoning" },
      });
    }

    broadcast(event);
    checkCrisisResolution(id);
  });

  proc.on("exit", (code) => {
    const wasAlive = entry.alive;
    entry.alive = false;
    if (wasAlive) {
      broadcast({
        kind: "AGENT_DIED",
        tick,
        actorId: id,
        payload: { reason: code === 0 ? "natural" : `exit ${code}` },
      });
    }

    if (inftAdapter && entry.tokenId && !entry.sold) {
      console.log(
        `[engine] [iNFT] ${id}: died — setting dormant tokenId=${entry.tokenId}`,
      );
      const dormantMeta = buildMetadata(entry, skills, tick);
      dormantMeta.status = "dormant";
      dormantMeta.deathTick = tick;
      dormantMeta.deathReason = code === 0 ? "natural" : `exit ${code}`;
      inftAdapter.setDormant(entry.tokenId, dormantMeta).catch(console.error);
    }

    // Immediately tell surviving agents to drop this peer so they don't
    // whisper to a dead / not-yet-replaced agent during the gap.
    broadcastPeerList();

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
        spawnAgent(
          nextId,
          inheritedSkillRoots,
          [
            {
              agentId: id,
              reason: code === 0 ? "hunger" : `exit code ${code}`,
            },
          ],
          ancestorTokenIds,
        );
        broadcastPeerList();
      }, 3 * TICK_MS);
    }
  });

  const spawnedName = nftIdentity?.name ?? personality.name;
  const spawnedTraits = nftIdentity?.traits ?? personality.traits ?? [];
  const spawnedImage = nftIdentity?.image ?? entry.image;
  // For imports, expose the inherited skills (id + name) so the UI can render the panel
  // immediately, sourced from NFT metadata. Names come from the engine's `skills` cache,
  // which spawnFromNFT already hydrated from 0G via rootHash.
  const inheritedSkillsForUi = Object.keys(inheritedSkillRoots).flatMap(
    (sid) => {
      const s = skills.get(sid);
      return s ? [{ id: sid, name: s.skill.name }] : [];
    },
  );
  broadcast({
    kind: "AGENT_SPAWNED",
    tick,
    actorId: id,
    payload: {
      personalityId,
      name: spawnedName,
      traits: spawnedTraits,
      ...(spawnedImage ? { image: spawnedImage } : {}),
      ...(inheritedSkillsForUi.length ? { skills: inheritedSkillsForUi } : {}),
    },
  });
}

async function spawnFromNFT(tokenId: string): Promise<string | null> {
  if (!inftAdapter) return null;
  console.log(
    `[engine] [iNFT] spawnFromNFT: tokenId=${tokenId} — reading metadata…`,
  );
  const metadata = await inftAdapter.readMetadata(tokenId);
  // Unique runtime id: personalityId-tokenId avoids collisions with local agents
  const uniqueId = `${metadata.personalityId}-${tokenId}`;
  console.log(
    `[engine] [iNFT] spawnFromNFT: uniqueId=${uniqueId} skills=${metadata.skills.length}`,
  );
  // Pre-populate the skills Map with stubs (id, name, rootHash) so AGENT_SPAWNED can
  // emit names immediately. Don't block the spawn on per-skill 0G downloads — the agent
  // runtime fetches the full Skill bodies in boot() via listSkills(), and the engine's
  // skills map gets upgraded with real bodies via the META_SKILL_ROOT events that follow.
  for (const s of metadata.skills) {
    if (skills.get(s.id)?.skill.description) continue;
    skills.set(s.id, { skill: makeSkillStub(s), rootHash: s.rootHash });
  }
  const inheritedSkillRoots = Object.fromEntries(
    metadata.skills.map((s) => [s.id, s.rootHash]),
  );
  const nftIdentity = {
    name: metadata.name,
    traits: metadata.traits,
    personalityId: metadata.personalityId,
    image: metadata.image,
  };
  spawnAgent(
    uniqueId,
    inheritedSkillRoots,
    [],
    [...metadata.ancestorTokenIds, tokenId],
    tokenId,
    nftIdentity,
  );
  return uniqueId;
}

function broadcastPeerList(): void {
  // Only alive agents are valid peers — dead/exited processes can't receive AXL whispers.
  const aliveIds = [...agents.values()].filter((a) => a.alive).map((a) => a.id);
  for (const agent of agents.values()) {
    if (!agent.alive) continue;
    sendToAgent(agent, {
      kind: "PEERS",
      peerIds: aliveIds.filter((id) => id !== agent.id),
    });
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
      // No manual hunger reset — closing the crisis saves the agent. Hunger ticker
      // keeps running but the deadline-death check skips this crisis once resolved.
    }

    const allResolved = crisis.targets.every((targetId) => {
      const a = agents.get(targetId);
      return !a?.alive || agentCanResolve(targetId, crisis);
    });

    if (allResolved) {
      resolvedCrises.add(crisisId);
      activeCrises.delete(crisisId);
      perCrisisResolvedAgents.delete(crisisId);
      const survived = crisis.targets.filter((id) => agents.get(id)?.alive);
      const died = crisis.targets.filter((id) => !agents.get(id)?.alive);
      const totalAlive = [...agents.values()].filter((a) => a.alive).length;
      broadcast({
        kind: "CRISIS_RESOLVED",
        tick,
        actorId: "engine",
        payload: { crisisId, survived, died, totalAlive },
      });
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
    broadcast({
      kind: "AGENT_HUNGER",
      tick,
      actorId: agent.id,
      payload: {
        hunger: agent.hunger,
        threshold: agent.hungerConfig.threshold,
      },
    });

    // Inject a HUNGER crisis at 65% of threshold so the agent has time to evolve a food skill
    const WARNING_RATIO = 0.65;
    const warningLevel = agent.hungerConfig.threshold * WARNING_RATIO;
    const hasActiveHungerCrisis = [...activeCrises.values()].some(
      (c) => c.type.toLowerCase() === "hunger" && c.targets.includes(agent.id),
    );
    const warnKey = `hunger-warn-${agent.id}`;
    if (
      agent.hunger >= warningLevel &&
      !hasActiveHungerCrisis &&
      !resolvedCrises.has(warnKey)
    ) {
      const ticksLeft = Math.max(
        5,
        Math.ceil(
          (agent.hungerConfig.threshold - agent.hunger) /
            agent.hungerConfig.rate,
        ),
      );
      const crisisId = warnKey;
      const crisis: Crisis = {
        id: crisisId,
        type: "HUNGER",
        description:
          "You are starving. You must find, gather, or produce food using items around you to survive.",
        startedAtTick: tick,
        deadlineTicks: ticksLeft,
        targets: [agent.id],
      };
      activeCrises.set(crisisId, crisis);
      broadcast({
        kind: "CRISIS_STARTED",
        tick,
        actorId: "engine",
        payload: crisis,
      });
      sendToAgent(agent, { kind: "TICK", tick, crises: [crisis] });
    }

    // No standalone threshold death. Death-from-hunger goes through the same crisis
    // mechanism as lion: a HUNGER crisis is injected at the warning level above; if the
    // agent doesn't resolve it before its deadline, the per-crisis deadline check below
    // kills them. AGENT_RESCUED clears the crisis from activeCrises and saves the agent.
  }

  for (const [crisisId, crisis] of [...activeCrises]) {
    if (resolvedCrises.has(crisisId)) continue;
    if (tick < crisis.startedAtTick + crisis.deadlineTicks) continue;

    const survived: string[] = [];
    const killed: string[] = [];
    const individuallyResolved =
      perCrisisResolvedAgents.get(crisisId) ?? new Set<string>();

    for (const targetId of crisis.targets) {
      const agent = agents.get(targetId);
      if (!agent?.alive) continue;
      if (individuallyResolved.has(targetId)) {
        survived.push(targetId);
      } else {
        killed.push(targetId);
        agent.proc.stdin!.write(
          JSON.stringify({ kind: "DIE", reason: `crisis:${crisis.type}` }) +
            "\n",
        );
        agent.alive = false;
        broadcast({
          kind: "AGENT_DIED",
          tick,
          actorId: targetId,
          payload: { reason: `crisis:${crisis.type}` },
        });
      }
    }

    resolvedCrises.add(crisisId);
    activeCrises.delete(crisisId);
    perCrisisResolvedAgents.delete(crisisId);
    broadcast({
      kind: "CRISIS_OVER",
      tick,
      actorId: "engine",
      payload: { crisisId, survived, killed },
    });
  }

  const newCrisesByAgent = new Map<string, Crisis[]>();
  for (const entry of environment.crisisSchedule) {
    if (entry.tick !== tick) continue;
    const crisisId = `${entry.type}-${tick}`;
    const targets = (entry.targets ?? [...agents.keys()]).filter(
      (id) => agents.get(id)?.alive,
    );
    const crisis: Crisis = {
      id: crisisId,
      type: entry.type,
      description:
        entry.type === "LION"
          ? "A lion is nearby and hunting you. You must scare it away or defend yourself to survive."
          : entry.type === "HUNGER"
          ? "You are starving. You must find, gather, or produce food using items around you to survive."
          : `A ${entry.type.toLowerCase()} crisis is threatening your survival.`,
      startedAtTick: tick,
      deadlineTicks: entry.deadlineTicks,
      targets,
    };
    activeCrises.set(crisisId, crisis);
    broadcast({
      kind: "CRISIS_STARTED",
      tick,
      actorId: "engine",
      payload: crisis,
    });
    for (const targetId of targets) {
      const list = newCrisesByAgent.get(targetId) ?? [];
      list.push(crisis);
      newCrisesByAgent.set(targetId, list);
    }
  }

  for (const agent of agents.values()) {
    if (!agent.alive) continue;
    const crises = newCrisesByAgent.get(agent.id) ?? [];
    sendToAgent(agent, { kind: "TICK", tick, crises });
  }
}

// --- Boot ---
async function main(): Promise<void> {
  startHttpServer({
    port: HTTP_PORT,
    agents,
    skills,
    activeCrises,
    resolvedCrises,
    broadcast,
    sendToAgent,
    getTick: () => tick,
    spawnFromNFT,
  });

  startContractListeners({
    agents,
    broadcast,
    getTick: () => tick,
    spawnFromNFT,
  });

  if (INFT_ENABLED && inftAdapter) {
    if (marketplaceAdapter && process.env["MARKETPLACE_CONTRACT_ADDRESS"]) {
      await inftAdapter
        .approveMarketplaceForAll(process.env["MARKETPLACE_CONTRACT_ADDRESS"])
        .catch(console.error);
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
