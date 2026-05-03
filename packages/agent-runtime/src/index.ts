import { createInterface } from "node:readline";
import { createKernel, ZeroGComputeAdapter, ZeroGStorageAdapter, AxlAdapter } from "@moirai/kernel-impl";
import { loadPersonality } from "@moirai/personality";
import { loadEnvironment, skillResolvesCrisis } from "@moirai/environment";
import type { Kernel } from "@moirai/kernel";
import type { Event, Crisis, Skill } from "@moirai/shared";

const agentId = process.env["AGENT_ID"]!;
const personalityId = process.env["PERSONALITY_ID"] ?? agentId;
const axlUrl = process.env["AXL_URL"] ?? "http://127.0.0.1:19002";

function emit(event: Event): void {
  process.stdout.write(JSON.stringify(event) + "\n");
}

const personality = loadPersonality(personalityId);
const environment = loadEnvironment();

const computeAdapter = new ZeroGComputeAdapter({
  rpcUrl: process.env["ZG_RPC_URL"]!,
  privateKey: process.env["ZG_PRIVATE_KEY"]!,
  timeoutMs: 90_000,
});

const storageAdapter = new ZeroGStorageAdapter({
  indexerUrl: process.env["ZG_INDEXER_URL"] ?? "https://indexer-storage-testnet-standard.0g.ai",
  rpcUrl: process.env["ZG_RPC_URL"]!,
  privateKey: process.env["ZG_PRIVATE_KEY"]!,
});

const axlKeyPath = process.env["AXL_KEY_PATH"];
const axlAdapter = new AxlAdapter({
  selfId: agentId,
  axlUrl,
  ...(axlKeyPath ? { privateKeyPath: axlKeyPath } : {}),
});

const agentInventory: string[] = personality.inventory ?? environment.resources.slice(0, 3);

let kernel: Kernel;
let tick = 0;
const knownSkills: Skill[] = [];
const activeCrises = new Map<string, Crisis>();
const processingCrises = new Set<string>();
const failedCrises = new Map<string, Crisis>(); // evolve rejected; resolved if a matching skill is learned
const learningSkills = new Set<string>(); // dedup concurrent AXL + relay delivers
let knownPeerIds: string[] = [];
let ancestorDeaths: Array<{ agentId: string; reason: string }> = [];
let booted = false;
let dying = false;

async function handleLearn(skillId: string, rootHash: string, from: string): Promise<void> {
  if (knownSkills.find((s) => s.id === skillId)) return;
  if (learningSkills.has(skillId)) return;
  learningSkills.add(skillId);
  try {
    if (rootHash) storageAdapter.seedSkillRoot(skillId, rootHash);
    const skill = await kernel.storage.getSkill(skillId);
    if (!skill) {
      console.error(`[${agentId}] getSkill returned null for ${skillId} — SKILL_LEARNED will not fire`);
      return;
    }

    // Agent evaluates the offered skill through their own personality lens
    try {
      const result = await kernel.evaluateAdoption({
        skill,
        personality,
        environment,
        inventory: agentInventory,
      });
      if (!result.adopt) {
        const reason = result.failureModes[0];
        console.error(`[${agentId}] DECLINED "${skill.name}" from ${from} | effect: ${skill.effect} | score=${result.score.toFixed(3)}${reason ? ` | reason: ${reason}` : ""}`);
        emit({
          kind: "SKILL_DECLINED",
          tick,
          actorId: agentId,
          payload: { from, skillId, skillName: skill.name, skillEffect: skill.effect, score: result.score, ...(reason ? { reason } : {}) },
        });
        return;
      }
    } catch (err) {
      // Default-allow on eval failure so skills aren't silently lost
      console.error(`[${agentId}] adoption eval error, defaulting to accept:`, err instanceof Error ? err.message : err);
    }

    knownSkills.push(skill);
    // Emit SKILL_LEARNED first so engine's knownSkillIds contains skillId by the time
    // META_SKILL_ROOT triggers the updateMetadata write.
    const ev: Event = { kind: "SKILL_LEARNED", tick, actorId: agentId, payload: { from, skillId } };
    emit(ev);
    await kernel.storage.appendEvent(ev);
    const learnedRoot = storageAdapter.getSkillRoot(skillId);
    if (learnedRoot) {
      process.stdout.write(
        JSON.stringify({ _kind: "META_SKILL_ROOT", skillId, rootHash: learnedRoot, skillName: skill.name }) + "\n",
      );
    }

    // Agent can now handle a previously failed crisis thanks to the learned skill
    for (const [crisisId, crisis] of failedCrises) {
      if (skillResolvesCrisis(skill, crisis, environment)) {
        failedCrises.delete(crisisId);
        emit({ kind: "AGENT_RESCUED", tick, actorId: agentId, payload: { crisisId, crisisType: crisis.type, skillUsed: skill.name } });
      }
    }
  } finally {
    learningSkills.delete(skillId);
  }
}

async function boot(inheritedSkillRoots: Record<string, string>): Promise<void> {
  for (const [skillId, root] of Object.entries(inheritedSkillRoots)) {
    storageAdapter.seedSkillRoot(skillId, root);
  }

  kernel = await createKernel({
    compute: computeAdapter,
    storage: storageAdapter,
    network: axlAdapter,
    emit,
  });

  await axlAdapter.connect([]);

  kernel.net.subscribe(async (msg) => {
    const body = msg.payload as { kind?: string; skillId?: string; rootHash?: string };
    console.error(`[${agentId}] AXL msg from=${msg.from} kind=${body?.kind ?? "?"}`);
    if (body?.kind === "TEACH" && body.skillId) {
      console.error(`[${agentId}] AXL TEACH from=${msg.from} skillId=${body.skillId} rootHash=${body.rootHash ?? "(none)"}`);
      await handleLearn(body.skillId, body.rootHash ?? "", msg.from);
    }
  });

  // Inherit any skills seeded from prior agents
  const inherited = await kernel.storage.listSkills();
  for (const skill of inherited) {
    if (knownSkills.find((s) => s.id === skill.id)) continue;
    knownSkills.push(skill);
    // SKILL_INHERITED first, then META_SKILL_ROOT — same ordering invariant as handleLearn.
    const ev: Event = {
      kind: "SKILL_INHERITED",
      tick,
      actorId: agentId,
      payload: { skillId: skill.id },
    };
    emit(ev);
    await kernel.storage.appendEvent(ev);
    const inheritedRoot = storageAdapter.getSkillRoot(skill.id);
    if (inheritedRoot) {
      process.stdout.write(
        JSON.stringify({ _kind: "META_SKILL_ROOT", skillId: skill.id, rootHash: inheritedRoot, skillName: skill.name }) + "\n",
      );
    }
  }

  booted = true;
}

async function handleTick(newTick: number, incomingCrises: Crisis[]): Promise<void> {
  tick = newTick;
  for (const crisis of incomingCrises) {
    if (!activeCrises.has(crisis.id)) activeCrises.set(crisis.id, crisis);
  }

  for (const [crisisId, crisis] of activeCrises) {
    if (processingCrises.has(crisisId)) continue;

    const match = knownSkills.find((s) => skillResolvesCrisis(s, crisis, environment));
    if (match) {
      activeCrises.delete(crisisId);
      emit({ kind: "AGENT_RESCUED", tick, actorId: agentId, payload: { crisisId, crisisType: crisis.type, skillUsed: match.name } });
      continue;
    }

    processingCrises.add(crisisId);
    activeCrises.delete(crisisId);

    try {
      const result = await kernel.evolve({
        personality,
        environment,
        crisis,
        context: {
          agentId,
          tick,
          inventory: agentInventory,
          knownSkillIds: knownSkills.map((s) => s.id),
        },
        knownSkills,
      });

      if (result.status === "rejected") {
        failedCrises.set(crisisId, crisis);
      } else if (result.status === "accepted") {
        knownSkills.push(result.skill);
        // SKILL_ACCEPTED (emitted from inside evolve) now carries rootHash, so the engine
        // can update NFT metadata immediately without a separate META_SKILL_ROOT trip.
        const rootHash = storageAdapter.getSkillRoot(result.skill.id);

        // Teach all peers over AXL.
        // Intersect AXL topology (who's network-reachable) with engine's knownPeerIds
        // (who's alive). AXL keeps a peer's identity registered after its process exits,
        // so using topology alone whispers to dead peers; using knownPeerIds alone risks
        // whispering to peers on a different AXL relay. Both filters together = correct set.
        const axlPeers = await kernel.net.topology();
        const aliveSet = new Set(knownPeerIds);
        let peers = axlPeers.filter((p) => p !== agentId && (aliveSet.size === 0 || aliveSet.has(p)));

        for (const peer of peers) {
          console.error(`[${agentId}] AXL TEACH → ${peer} skillId=${result.skill.id} rootHash=${rootHash ?? "(none)"}`);
          await kernel.net.whisper(peer, { kind: "TEACH", skillId: result.skill.id, rootHash: rootHash ?? "" });
          emit({
            kind: "AXL_MESSAGE",
            tick,
            actorId: agentId,
            payload: { from: agentId, to: peer, kind: "TEACH", body: { skillId: result.skill.id } },
          });
          emit({
            kind: "SKILL_TAUGHT",
            tick,
            actorId: agentId,
            payload: { to: peer, skillId: result.skill.id },
          });
        }

        emit({ kind: "AGENT_RESCUED", tick, actorId: agentId, payload: { crisisId, crisisType: crisis.type, skillUsed: result.skill.name } });
      }
    } catch (err) {
      console.error(`[${agentId}] evolve error:`, err instanceof Error ? err.message : err);
    } finally {
      processingCrises.delete(crisisId);
    }
  }
}

type EngineMsg =
  | { kind: "BOOT"; peerIds?: string[]; inheritedSkillRoots?: Record<string, string>; ancestorDeaths?: Array<{ agentId: string; reason: string }> }
  | { kind: "TICK"; tick: number; crises: Crisis[] }
  | { kind: "PEERS"; peerIds: string[] }
  | { kind: "DIE"; reason?: string };

const queue: Array<() => Promise<void>> = [];
let draining = false;

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  while (queue.length > 0) {
    const next = queue.shift()!;
    await next().catch((err) =>
      console.error(`[${agentId}] task error:`, err instanceof Error ? err.message : err),
    );
  }
  draining = false;
}

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg: EngineMsg;
  try {
    msg = JSON.parse(trimmed) as EngineMsg;
  } catch {
    return;
  }

  if (msg.kind === "BOOT") {
    knownPeerIds = msg.peerIds ?? [];
    ancestorDeaths = msg.ancestorDeaths ?? [];
    queue.push(() => boot(msg.inheritedSkillRoots ?? {}));
  } else if (msg.kind === "PEERS") {
    knownPeerIds = msg.peerIds;
  } else if (msg.kind === "TICK" && booted && !dying) {
    queue.push(() => handleTick(msg.tick, msg.crises ?? []));
  } else if (msg.kind === "DIE") {
    dying = true;
    queue.length = 0; // drop pending ticks so DIE runs immediately
    queue.push(async () => {
      await Promise.race([
        axlAdapter.disconnect(),
        new Promise((r) => setTimeout(r, 2000)),
      ]);
      process.exit(0);
    });
  }

  void drain();
});

rl.on("close", () => process.exit(0));
