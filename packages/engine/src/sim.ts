import { EventType, type DomainEvent } from "@moirai/shared";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import { bootEngine } from "./index.js";

type SimMode = "compact" | "verbose";
type SimStart = "fresh" | "resume";
type DemoPhase = "village" | "crisis" | "evolution" | "teaching" | "inheritance";
type Scoreboard = {
  events: number;
  crisesStarted: number;
  crisesResolved: number;
  skillsAccepted: number;
  skillsLearned: number;
  skillsInherited: number;
  hiddenRulesDiscovered: number;
  foodGathered: number;
  deaths: number;
  spawns: number;
};

type LiveWorld = {
  alive: Set<string>;
  activeCrises: Set<string>;
};

function parseMode(argv: string[]): SimMode {
  return argv.includes("--verbose") ? "verbose" : "compact";
}

function parseStart(argv: string[]): SimStart {
  return argv.includes("--resume") ? "resume" : "fresh";
}

function formatEvent(event: DomainEvent): string {
  const p = event.payload ?? {};
  switch (event.type) {
    case EventType.CRISIS_STARTED:
      return `crisis ${String(p.crisisId ?? "?")} started (${String(p.type ?? "unknown")})`;
    case EventType.CRISIS_RESOLVED:
      return `crisis ${String(p.crisisId ?? "?")} resolved (${String(p.outcome ?? "unknown")})`;
    case EventType.REASONING_STARTED:
      return `reasoning started for crisis ${String(p.crisisId ?? "?")}`;
    case EventType.SKILL_PROPOSED:
      return `proposed skill ${String(p.skillName ?? p.name ?? p.skillId ?? "?")}`;
    case EventType.SELF_EVAL_RESULT:
      return `self-eval score=${String(p.score ?? "?")} accepted=${String(p.accepted ?? "?")}`;
    case EventType.SKILL_ACCEPTED:
      return `accepted skill ${String(p.skillName ?? p.name ?? p.skillId ?? "?")}`;
    case EventType.SKILL_LEARNED:
      return `learned skill ${String(p.skillId ?? "?")}`;
    case EventType.SKILL_INHERITED:
      return `inherited skill ${String(p.skillId ?? "?")}`;
    case EventType.AXL_MESSAGE:
      return `axl message -> ${String(p.to ?? "?")}`;
    case EventType.AGENT_DIED:
      return `agent died (${String(p.reason ?? "unknown")})`;
    case EventType.AGENT_SPAWNED:
      return `agent spawned (${String(p.personalityId ?? "unknown")})`;
    case EventType.ACTIVITY_STARTED:
      return `activity ${String(p.activity ?? "?")} started`;
    case EventType.ACTIVITY_INTERRUPTED:
      return `activity ${String(p.activity ?? "?")} interrupted by crisis ${String(p.crisisId ?? "?")}`;
    case EventType.FOOD_GATHERED:
      return `${String(p.method ?? "UNKNOWN")} gathered ${String(p.yield ?? "?")}`;
    case EventType.HIDDEN_RULE_DISCOVERED:
      return `hidden rule discovered: ${String(p.ruleId ?? "?")}`;
    case EventType.EPISODE_LOADED:
      return `episode loaded: ${String(p.episodeId ?? "?")}`;
    case EventType.EPISODE_SAVED:
      return `episode saved: ${String(p.episodeId ?? "?")}`;
    default:
      return event.type;
  }
}

function shouldPrint(event: DomainEvent, mode: SimMode): boolean {
  if (mode === "verbose") return true;
  return (
    event.type !== EventType.WORLD_TICK &&
    event.type !== EventType.CURIOSITY_PEAK &&
    event.type !== EventType.SELF_EVAL_STARTED
  );
}

function printHeader(mode: SimMode, worldId: string, agentIds: string[], tickIntervalMs: number, maxTicks: number): void {
  console.log("============================================================");
  console.log(" MOIRAI // BUZZING VILLAGE TERMINAL DEMO");
  console.log("============================================================");
  console.log(` world=${worldId} agents=[${agentIds.join(", ")}]`);
  console.log(` tickMs=${tickIntervalMs} maxTicks=${maxTicks} mode=${mode}`);
  console.log(" controls: Ctrl+C to stop early");
  console.log("============================================================\n");
}

function phaseFor(eventType: EventType): DemoPhase | undefined {
  if (eventType === EventType.CRISIS_STARTED || eventType === EventType.CRISIS_RESOLVED) return "crisis";
  if (
    eventType === EventType.REASONING_STARTED ||
    eventType === EventType.SKILL_PROPOSED ||
    eventType === EventType.SELF_EVAL_RESULT ||
    eventType === EventType.SKILL_ACCEPTED
  ) {
    return "evolution";
  }
  if (eventType === EventType.AXL_MESSAGE || eventType === EventType.SKILL_TAUGHT || eventType === EventType.SKILL_LEARNED) {
    return "teaching";
  }
  if (eventType === EventType.SKILL_INHERITED || eventType === EventType.AGENT_DIED || eventType === EventType.AGENT_SPAWNED) {
    return "inheritance";
  }
  if (eventType === EventType.ACTIVITY_STARTED || eventType === EventType.FOOD_GATHERED || eventType === EventType.HIDDEN_RULE_DISCOVERED) {
    return "village";
  }
  return undefined;
}

function printPhaseBanner(phase: DemoPhase, tick: number): void {
  const title =
    phase === "village"
      ? "VILLAGE LOOP"
      : phase === "crisis"
        ? "CRISIS"
        : phase === "evolution"
          ? "SELF-EVOLUTION"
          : phase === "teaching"
            ? "PEER TEACHING"
            : "INHERITANCE";
  console.log(`\n--- ${title} @ tick ${tick} ---`);
}

function newScoreboard(): Scoreboard {
  return {
    events: 0,
    crisesStarted: 0,
    crisesResolved: 0,
    skillsAccepted: 0,
    skillsLearned: 0,
    skillsInherited: 0,
    hiddenRulesDiscovered: 0,
    foodGathered: 0,
    deaths: 0,
    spawns: 0,
  };
}

function updateScoreboard(board: Scoreboard, event: DomainEvent): void {
  board.events += 1;
  switch (event.type) {
    case EventType.CRISIS_STARTED:
      board.crisesStarted += 1;
      break;
    case EventType.CRISIS_RESOLVED:
      board.crisesResolved += 1;
      break;
    case EventType.SKILL_ACCEPTED:
      board.skillsAccepted += 1;
      break;
    case EventType.SKILL_LEARNED:
      board.skillsLearned += 1;
      break;
    case EventType.SKILL_INHERITED:
      board.skillsInherited += 1;
      break;
    case EventType.HIDDEN_RULE_DISCOVERED:
      board.hiddenRulesDiscovered += 1;
      break;
    case EventType.FOOD_GATHERED: {
      const y = Number(event.payload.yield ?? 0);
      board.foodGathered += Number.isFinite(y) ? y : 0;
      break;
    }
    case EventType.AGENT_DIED:
      board.deaths += 1;
      break;
    case EventType.AGENT_SPAWNED:
      board.spawns += 1;
      break;
  }
}

function printHeartbeat(tick: number, maxTicks: number): void {
  const pct = Math.max(0, Math.min(100, Math.round((tick / Math.max(1, maxTicks)) * 100)));
  const bars = Math.round(pct / 10);
  const bar = `${"#".repeat(bars)}${"-".repeat(10 - bars)}`;
  console.log(`[t=${String(tick).padStart(3, "0")}] progress [${bar}] ${pct}%`);
}

function nowStamp(): string {
  return new Date().toISOString().slice(11, 19);
}

function elapsedSince(startMs: number): string {
  const deltaSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  const mm = Math.floor(deltaSec / 60)
    .toString()
    .padStart(2, "0");
  const ss = (deltaSec % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function updateLiveWorld(live: LiveWorld, event: DomainEvent): void {
  const p = event.payload ?? {};
  switch (event.type) {
    case EventType.AGENT_SPAWNED:
      live.alive.add(event.actorId);
      break;
    case EventType.AGENT_DIED:
      live.alive.delete(event.actorId);
      break;
    case EventType.CRISIS_STARTED:
      live.activeCrises.add(String(p.crisisId ?? "?"));
      break;
    case EventType.CRISIS_RESOLVED:
      live.activeCrises.delete(String(p.crisisId ?? "?"));
      break;
  }
}

function printLiveWorld(live: LiveWorld): void {
  const crises = [...live.activeCrises];
  console.log(
    `        world alive=${live.alive.size} crises=${crises.length}${crises.length > 0 ? ` [${crises.join(", ")}]` : ""}`,
  );
}

function printRecap(board: Scoreboard, tick: number): void {
  console.log("\n==================== DEMO RECAP ====================");
  console.log(` ticks reached         : ${tick}`);
  console.log(` total events observed : ${board.events}`);
  console.log(` crises                : ${board.crisesStarted} started / ${board.crisesResolved} resolved`);
  console.log(` evolution             : ${board.skillsAccepted} skills accepted`);
  console.log(` knowledge transfer    : ${board.skillsLearned} learned / ${board.skillsInherited} inherited`);
  console.log(` village economy       : ${board.foodGathered} food gathered`);
  console.log(` hidden rules found    : ${board.hiddenRulesDiscovered}`);
  console.log(` lifecycle             : ${board.spawns} spawns / ${board.deaths} deaths`);
  console.log("====================================================");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const mode = parseMode(argv);
  const start = parseStart(argv);
  const episodeDir = start === "fresh" ? mkdtempSync(join(tmpdir(), "moirai-sim-")) : process.env.MOIRAI_EPISODE_DIR;
  const devStorageDir =
    start === "fresh" ? mkdtempSync(join(tmpdir(), "moirai-dev-storage-sim-")) : process.env.MOIRAI_DEV_STORAGE;
  const config = loadConfig({
    ...process.env,
    MOIRAI_WS_PORT: process.env.MOIRAI_WS_PORT ?? "0",
    ...(episodeDir ? { MOIRAI_EPISODE_DIR: episodeDir } : {}),
    ...(devStorageDir ? { MOIRAI_DEV_STORAGE: devStorageDir } : {}),
  });

  printHeader(
    mode,
    config.worldId,
    config.agents.map((a) => a.agentId),
    config.tickIntervalMs,
    config.maxTicks,
  );
  console.log(` start=${start} episodeDir=${config.episodePersistenceDir}`);
  if (devStorageDir) console.log(` storage=${devStorageDir}`);
  console.log("");

  const handle = await bootEngine(config);
  let tickCount = 0;
  let lastHeartbeat = -1;
  let phase: DemoPhase | undefined;
  const scoreboard = newScoreboard();
  const live: LiveWorld = { alive: new Set(config.agents.map((a) => a.agentId)), activeCrises: new Set() };
  const startMs = Date.now();

  handle.bus.subscribe((event) => {
    updateScoreboard(scoreboard, event);
    updateLiveWorld(live, event);

    if (event.type === EventType.WORLD_TICK) {
      tickCount = event.tick;
      if (tickCount - lastHeartbeat >= 10 || tickCount === config.maxTicks) {
        printHeartbeat(tickCount, config.maxTicks);
        printLiveWorld(live);
        lastHeartbeat = tickCount;
      }
      return;
    }

    const nextPhase = phaseFor(event.type);
    if (nextPhase && nextPhase !== phase) {
      phase = nextPhase;
      printPhaseBanner(phase, event.tick);
    }

    if (!shouldPrint(event, mode)) return;
    console.log(
      `  [${nowStamp()} +${elapsedSince(startMs)} t=${String(event.tick).padStart(3, "0")}] ${event.actorId} :: ${formatEvent(event)}`,
    );
  });

  const stopOnce = async (): Promise<void> => {
    await handle.stop();
    printRecap(scoreboard, tickCount);
    console.log(`\nSimulation stopped at tick=${tickCount}`);
  };

  process.once("SIGINT", () => {
    void stopOnce().finally(() => process.exit(0));
  });

  process.once("SIGTERM", () => {
    void stopOnce().finally(() => process.exit(0));
  });
}

main().catch((err) => {
  console.error("SIM FAIL:", err);
  process.exit(1);
});
