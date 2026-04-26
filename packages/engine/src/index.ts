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
  applyExperimentEffect,
  applyRestEffect,
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
  const env = await loadEnvironment(config.environmentPath);
  const orchestrator = createCrisisOrchestrator(env);
  const world = createWorld();
  const bus = new EventBus();
  const episodeDir = config.episodePersistenceDir;
  const episodeId = nextEpisodeId(episodeDir);
  const previousEpisode = loadLatestEpisode(episodeDir);
  if (previousEpisode) {
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

  bus.subscribe((event) => browser.send({ kind: "EVENT", event }));

  const supervisor = new Supervisor({
    onMessage: (agentId, msg) => handleAgentMessage(agentId, msg),
    onExit: (agentId) => peerRouter.unregister(agentId),
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

    for (const expired of expireCrises(world)) {
      bus.emit(
        domainEvent(EventType.CRISIS_RESOLVED, world.tick, "engine", {
          crisisId: expired.id,
          outcome: "expired",
        }),
      );
    }

    replenishFoodPool(world);

    for (const a of Object.values(world.agents)) {
      if (!a.alive) continue;

      decayAgentNeeds(world, a.id);

      const forced = config.forcedDeaths.find((d) => d.agentId === a.id && d.tick === world.tick);
      if (forced || a.needs.hunger >= 100) {
        killAgent(world, a.id);
        bus.emit(
          domainEvent(EventType.AGENT_DIED, world.tick, a.id, {
            reason: forced ? "forced" : "hunger",
          }),
        );
        supervisor.send(a.id, { kind: "SHUTDOWN" });

        const next = inheritorQueue.shift();
        if (next) void respawn(next);
      } else {
        const view = nearbyAgents(world, a.id);
        supervisor.send(a.id, { kind: "TICK", tick: world.tick, me: a, nearby: view });
      }
    }

    if (world.tick % 4 === 0) emitWorld();
    if (world.tick >= config.maxTicks) void stop();
  }

  async function respawn(personalityId: string): Promise<void> {
    const personalityPath = seedPersonalityPath(personalityId);
    const p = await loadPersonality(personalityPath);
    const agentId = p.id;
    spawnAgent(world, agentId, p.id);
    bus.emit(domainEvent(EventType.AGENT_SPAWNED, world.tick, agentId, { personalityId: p.id, fresh: true }));
    const handle = supervisor.spawn({
      agentId,
      personalityPath,
      environmentPath: config.environmentPath,
      initialPeerIds: Object.keys(world.agents).filter((id) => id !== agentId && world.agents[id]?.alive),
      tick: world.tick,
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
        bus.emit(enriched);
        return;
      }

      case "PEER_SEND": {
        bus.emit(
          domainEvent(EventType.AXL_MESSAGE, world.tick, agentId, { to: msg.to, payload: msg.payload }),
        );
        peerRouter.whisper(agentId, msg.to, msg.payload);
        return;
      }

      case "PEER_BROADCAST": {
        bus.emit(domainEvent(EventType.AXL_MESSAGE, world.tick, agentId, { to: "*", payload: msg.payload }));
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
        if (skillResolvesCrisis(skill, crisis, env)) {
          resolveCrisis(world, crisis.id);
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
        const multiplier = world.tick % 20 === 0 ? (env.hiddenRules?.find(r => r.id === "dawn-forage")?.multiplier ?? 1) : 1;
        const yield_ = forageFood(world, agentId, multiplier);
        bus.emit(domainEvent(EventType.FOOD_GATHERED, world.tick, agentId, { method: "FORAGE", yield: yield_ }));
        if (multiplier > 1) bus.emit(domainEvent(EventType.HIDDEN_RULE_DISCOVERED, world.tick, agentId, { ruleId: "dawn-forage", effect: "Foraging at dawn yields double berries" }));
        return;
      }
      case "FARM": {
        const farmingAgents = Object.values(world.agents).filter(ag => ag.alive && ag.id !== agentId).length;
        const multiplier = farmingAgents >= 2 ? (env.hiddenRules?.find(r => r.id === "group-farm")?.multiplier ?? 1) : 1;
        const yield_ = farmFood(world, agentId, multiplier);
        bus.emit(domainEvent(EventType.FOOD_GATHERED, world.tick, agentId, { method: "FARM", yield: yield_ }));
        if (multiplier > 1) bus.emit(domainEvent(EventType.HIDDEN_RULE_DISCOVERED, world.tick, agentId, { ruleId: "group-farm", effect: "Collaborative farming yields triple food" }));
        return;
      }
      case "REST":
        applyRestEffect(world, agentId);
        return;
      case "SOCIALIZE": {
        const target = world.agents[action.targetId];
        if (target?.alive) {
          world.agents[agentId]!.needs.curiosity = Math.min(100, world.agents[agentId]!.needs.curiosity + 5);
          target.needs.curiosity = Math.min(100, target.needs.curiosity + 5);
        }
        return;
      }
      case "EXPERIMENT":
        applyExperimentEffect(world, agentId);
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
  return { crisisId: c.id, type: c.type, description: c.description, affected: c.affectedAgents, deadlineTick: c.deadlineTick };
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
