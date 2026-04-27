import { loadEnvironment, skillResolvesCrisis } from "@moirai/environment";
import { loadPersonality, seedPersonalityPath } from "@moirai/personality";
import {
  EventType,
  type AgentAction,
  type AgentToEngineMessage,
  type Crisis,
  type DomainEvent,
  type Skill,
  type WorldState,
} from "@moirai/shared";
import { loadConfig, type EngineConfig } from "./config.js";
import { createCrisisOrchestrator } from "./crisisOrchestrator.js";
import { EventBus } from "./eventBus.js";
import { PeerRouter } from "./peerRouter.js";
import { SkillCache } from "./skillCache.js";
import { Supervisor } from "./supervisor.js";
import { BrowserBridge } from "./wsServer.js";
import { loadLatestEpisode, nextEpisodeId, saveEpisode, type EpisodeSnapshot } from "./episodePersistence.js";
import {
  applyRestEffect,
  checkNeedsThresholds,
  cleanupAgentCrises,
  createWorld,
  decayAgentNeeds,
  expireCrises,
  farmFood,
  forageFood,
  killAgent,
  moveAgent,
  nearbyAgents,
  replenishFoodPool,
  resolveCrisis,
  spawnAgent,
  startCrisis,
} from "./world.js";

export type EngineHandle = {
  stop(): Promise<void>;
  bus: EventBus;
};

export async function bootEngine(config: EngineConfig = loadConfig()): Promise<EngineHandle> {
  if (config.devStorageDir) process.env.MOIRAI_DEV_STORAGE = config.devStorageDir;
  const env = await loadEnvironment(config.environmentPath);
  const orchestrator = createCrisisOrchestrator(env);
  const world = createWorld();
  const bus = new EventBus();
  const episodeDir = config.episodePersistenceDir;
  const episodeId = nextEpisodeId(episodeDir);
  const previousEpisode = config.resumeFromEpisode ? loadLatestEpisode(episodeDir) : null;
  if (previousEpisode && previousEpisode.world.tick < config.maxTicks) {
    Object.assign(world, previousEpisode.world);
    bus.emit(domainEvent(EventType.EPISODE_LOADED, world.tick, "engine", {
      episodeId: previousEpisode.episodeId,
      tick: previousEpisode.savedAt,
    }));
  }
  const peerRouter = new PeerRouter();
  const skillCache = new SkillCache();
  const browser = new BrowserBridge(config.wsPort);
  const inheritorQueue = [...config.inheritorPool];
  const evolvingAgents = new Set<string>(); // agents with a pending 0G compute call — immune to hunger death

  bus.subscribe((event) => browser.send({ kind: "EVENT", event }));

  const supervisor = new Supervisor({
    onMessage: (agentId, msg) => handleAgentMessage(agentId, msg),
    onExit: (agentId) => {
      peerRouter.unregister(agentId);
      evolvingAgents.delete(agentId); // crashed process = inference failed; let crisis expiry kill the agent
    },
  });

  const personalityById: Record<string, string> = {};
  for (const a of config.agents) personalityById[a.agentId] = a.personalityPath;

  for (const { agentId, personalityPath } of config.agents) {
    const p = await loadPersonality(personalityPath);
    spawnAgent(world, agentId, p.id);
    bus.emit(domainEvent(EventType.AGENT_SPAWNED, world.tick, agentId, { personalityId: p.id }));
  }

  for (const { agentId, personalityPath } of config.agents) {
    const handle = supervisor.spawn({
      agentId,
      personalityPath,
      environmentPath: config.environmentPath,
      initialPeerIds: config.agents.map((a) => a.agentId).filter((id) => id !== agentId),
      tick: world.tick,
    });
    peerRouter.register(agentId, handle.send);
  }

  let stopping = false;
  let interval: NodeJS.Timeout | undefined;

  function emitWorld(): void {
    browser.send({ kind: "WORLD", state: snapshot(world) });
  }

  function broadcastDeath(agentId: string, reason: string, crises: Crisis[]): void {
    killAgent(world, agentId);
    bus.emit(domainEvent(EventType.AGENT_DIED, world.tick, agentId, { reason, crisisTypes: crises.map((c) => c.type) }));
    supervisor.send(agentId, { kind: "SHUTDOWN" });
    for (const crisis of crises) {
      for (const [peerId, peer] of Object.entries(world.agents)) {
        if (peerId !== agentId && peer.alive) {
          supervisor.send(peerId, {
            kind: "PEER_MESSAGE",
            from: agentId,
            payload: { kind: "DEATH_WARNING", crisisType: crisis.type, crisisDescription: crisis.description },
          });
        }
      }
    }
    evolvingAgents.delete(agentId);
    // Purge this agent from all remaining active crises so they can't re-trigger on them
    const nowEmpty = cleanupAgentCrises(world, agentId);
    for (const c of nowEmpty) {
      bus.emit(domainEvent(EventType.CRISIS_EXPIRED, world.tick, "engine", {
        crisisId: c.id,
        type: c.type,
        affectedAgents: [...c.affectedAgents, agentId],
        casualties: [agentId],
      }));
    }
  }

  function tick(): void {
    if (stopping) return;
    world.tick++;
    bus.emit(domainEvent(EventType.WORLD_TICK, world.tick, "engine", {}));

    for (const c of orchestrator.step(world)) {
      startCrisis(world, c);
      bus.emit(domainEvent(EventType.CRISIS_STARTED, world.tick, "engine", crisisPayload(c)));
      for (const id of c.affectedAgents) {
        supervisor.send(id, { kind: "CRISIS", tick: world.tick, crisis: c });
      }
    }

    const diedThisTick: string[] = [];

    // Expire crises — kill all affected agents who failed to resolve in time
    for (const expired of expireCrises(world)) {
      const stillAlive = expired.affectedAgents.filter((id) => world.agents[id]?.alive);
      for (const affectedId of stillAlive) {
        if (evolvingAgents.has(affectedId)) continue; // mid-infer: spare this tick
        broadcastDeath(affectedId, "crisis_expired", [expired]);
        diedThisTick.push(affectedId);
      }
      bus.emit(domainEvent(EventType.CRISIS_EXPIRED, world.tick, "engine", {
        crisisId: expired.id,
        type: expired.type,
        affectedAgents: expired.affectedAgents,
        casualties: stillAlive,
      }));
    }

    replenishFoodPool(world);

    for (const a of Object.values(world.agents)) {
      if (!a.alive) continue;

      decayAgentNeeds(world, a.id);

      // Hunger / energy thresholds → internal crises
      const { newCrises, resolvedCrisisIds } = checkNeedsThresholds(world, a.id);
      for (const c of newCrises) {
        bus.emit(domainEvent(EventType.CRISIS_STARTED, world.tick, "engine", crisisPayload(c)));
        supervisor.send(a.id, { kind: "CRISIS", tick: world.tick, crisis: c });
      }
      for (const crisisId of resolvedCrisisIds) {
        bus.emit(domainEvent(EventType.CRISIS_RESOLVED, world.tick, a.id, { crisisId, outcome: "needs_recovered" }));
      }

      const forced = config.forcedDeaths.find((d) => d.agentId === a.id && d.tick === world.tick);
      if (forced && !evolvingAgents.has(a.id)) {
        const activeCrises = world.activeCrises.filter((c) => c.affectedAgents.includes(a.id));
        broadcastDeath(a.id, "forced", activeCrises);
        diedThisTick.push(a.id);
      } else {
        supervisor.send(a.id, { kind: "TICK", tick: world.tick, me: a, nearby: nearbyAgents(world, a.id) });
      }
    }

    // Spawn inheritors after all deaths are collected so predecessorIds is the full dead list
    for (const _ of diedThisTick) {
      const next = inheritorQueue.shift();
      if (next) void respawn(next, diedThisTick);
    }

    if (world.tick % 4 === 0) emitWorld();
    if (world.tick >= config.maxTicks) void stop();
  }

  async function respawn(personalityId: string, predecessorIds: string[] = []): Promise<void> {
    const personalityPath = seedPersonalityPath(personalityId);
    const p = await loadPersonality(personalityPath);
    const agentId = p.id;
    spawnAgent(world, agentId, p.id);
    bus.emit(domainEvent(EventType.AGENT_SPAWNED, world.tick, agentId, { personalityId: p.id, fresh: true, inheritedFrom: predecessorIds }));
    const handle = supervisor.spawn({
      agentId,
      personalityPath,
      environmentPath: config.environmentPath,
      initialPeerIds: Object.keys(world.agents).filter((id) => id !== agentId && world.agents[id]?.alive),
      tick: world.tick,
      predecessorIds,
    });
    peerRouter.register(agentId, handle.send);
  }

  function handleAgentMessage(agentId: string, msg: AgentToEngineMessage): void {
    switch (msg.kind) {
      case "READY":
        return;

      case "EVENT": {
        const enriched: DomainEvent = { ...msg.event, tick: world.tick, actorId: agentId };
        const payload = enriched.payload as { skill?: Skill };
        if (payload.skill && payload.skill.id) skillCache.register(payload.skill);
        if (enriched.type === EventType.REASONING_STARTED) evolvingAgents.add(agentId);
        if (enriched.type === EventType.SKILL_ACCEPTED || enriched.type === EventType.SKILL_REJECTED) evolvingAgents.delete(agentId);
        bus.emit(enriched);
        return;
      }

      case "PEER_SEND": {
        bus.emit(domainEvent(EventType.AXL_WHISPER, world.tick, agentId, { to: msg.to, payload: msg.payload }));
        peerRouter.whisper(agentId, msg.to, msg.payload);
        return;
      }

      case "PEER_BROADCAST": {
        bus.emit(domainEvent(EventType.AXL_BROADCAST, world.tick, agentId, { payload: msg.payload }));
        peerRouter.broadcast(agentId, msg.payload);
        return;
      }

      case "ACTION":
        return handleAction(agentId, msg.action);
    }
  }

  function handleAction(agentId: string, action: AgentAction): void {
    const a = world.agents[agentId];
    if (!a?.alive) return;
    switch (action.kind) {
      case "MOVE":
        moveAgent(world, agentId, action.dx, action.dy);
        return;
      case "IDLE":
        return;
      case "APPLY_SKILL": {
        const skill = skillCache.get(action.skillId);
        const crisis = world.activeCrises.find((c) => c.id === action.crisisId);
        if (!skill || !crisis) return;
        bus.emit(domainEvent(EventType.AGENT_ACTION, world.tick, agentId, { action: "APPLY_SKILL", skillId: skill.id, skillName: skill.name, crisisId: crisis.id }));
        if (skillResolvesCrisis(skill, crisis, env)) {
          resolveCrisis(world, crisis.id, agentId);
          bus.emit(
            domainEvent(EventType.CRISIS_RESOLVED, world.tick, agentId, {
              crisisId: crisis.id,
              outcome: "resolved",
              skillId: skill.id,
              skillName: skill.name,
            }),
          );
        }
        return;
      }
      case "FORAGE": {
        const yield_ = forageFood(world, agentId);
        bus.emit(domainEvent(EventType.FOOD_GATHERED, world.tick, agentId, { method: "FORAGE", yield: yield_ }));
        return;
      }
      case "FARM": {
        const yield_ = farmFood(world, agentId);
        bus.emit(domainEvent(EventType.FOOD_GATHERED, world.tick, agentId, { method: "FARM", yield: yield_ }));
        return;
      }
      case "REST":
        applyRestEffect(world, agentId);
        bus.emit(domainEvent(EventType.AGENT_ACTION, world.tick, agentId, { action: "REST" }));
        return;
      case "SOCIALIZE":
      case "EXPERIMENT":
        return;
    }
  }

  async function stop(): Promise<void> {
    if (stopping) return;
    stopping = true;
    if (interval) clearInterval(interval);
    const episodeSnapshot: EpisodeSnapshot = { episodeId, savedAt: world.tick, world: snapshot(world) };
    saveEpisode(episodeSnapshot, episodeDir);
    bus.emit(domainEvent(EventType.EPISODE_SAVED, world.tick, "engine", { episodeId }));
    supervisor.killAll();
    await browser.close();
  }

  interval = setInterval(tick, config.tickIntervalMs);
  emitWorld();

  return { stop, bus };
}

function snapshot(world: WorldState): WorldState {
  return {
    tick: world.tick,
    agents: Object.fromEntries(Object.entries(world.agents).map(([k, v]) => [k, { ...v, position: { ...v.position } }])),
    activeCrises: world.activeCrises.map((c) => ({ ...c })),
    foodPool: world.foodPool,
  };
}

function crisisPayload(c: Crisis): Record<string, unknown> {
  return { crisisId: c.id, type: c.type, description: c.description, affected: c.affectedAgents, deadlineTick: c.startedAtTick + c.deadlineTicks };
}

function domainEvent(type: EventType, tick: number, actorId: string, payload: Record<string, unknown>, receiptHash?: string): DomainEvent {
  return receiptHash !== undefined ? { type, tick, actorId, payload, receiptHash } : { type, tick, actorId, payload };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "");
if (isMain) {
  bootEngine().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
