import { EventType, type DomainEvent } from "@moirai/shared";
import { loadConfig } from "./config.js";
import { bootEngine } from "./index.js";

type SimMode = "compact" | "verbose";
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

function parseMode(argv: string[]): SimMode {
  return argv.includes("--verbose") ? "verbose" : "compact";
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
      return `proposed skill ${String(p.skillName ?? p.skillId ?? "?")}`;
    case EventType.SELF_EVAL_RESULT:
      return `self-eval score=${String(p.score ?? "?")} accepted=${String(p.accepted ?? "?")}`;
    case EventType.SKILL_ACCEPTED:
      return `accepted skill ${String(p.skillName ?? p.skillId ?? "?")}`;
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
  const mode = parseMode(process.argv.slice(2));
  const config = loadConfig({
    ...process.env,
    MOIRAI_WS_PORT: process.env.MOIRAI_WS_PORT ?? "0",
  });

  printHeader(
    mode,
    config.worldId,
    config.agents.map((a) => a.agentId),
    config.tickIntervalMs,
    config.maxTicks,
  );

  const handle = await bootEngine(config);
  let tickCount = 0;
  let lastHeartbeat = -1;
  let phase: DemoPhase | undefined;
  const scoreboard = newScoreboard();

  handle.bus.subscribe((event) => {
    updateScoreboard(scoreboard, event);

    if (event.type === EventType.WORLD_TICK) {
      tickCount = event.tick;
      if (tickCount - lastHeartbeat >= 10 || tickCount === config.maxTicks) {
        printHeartbeat(tickCount, config.maxTicks);
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
    console.log(`  [t=${String(event.tick).padStart(3, "0")}] ${event.actorId} :: ${formatEvent(event)}`);
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
