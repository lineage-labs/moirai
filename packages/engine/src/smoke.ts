import { EventType, type DomainEvent } from "@moirai/shared";
import { bootEngine } from "./index.js";
import { loadConfig } from "./config.js";

const REQUIRED_SEQUENCE: EventType[] = [
  EventType.CRISIS_STARTED,
  EventType.REASONING_STARTED,
  EventType.SKILL_PROPOSED,
  EventType.SELF_EVAL_RESULT,
  EventType.SKILL_ACCEPTED,
  EventType.AXL_MESSAGE,
  EventType.SKILL_LEARNED,
  EventType.AGENT_DIED,
  EventType.AGENT_SPAWNED,
  EventType.SKILL_INHERITED,
  EventType.CRISIS_RESOLVED,
];

async function main(): Promise<void> {
  const config = loadConfig({
    ...process.env,
    MOIRAI_MAX_TICKS: "200",
    MOIRAI_TICK_MS: "50",
    MOIRAI_WS_PORT: "0",
    MOIRAI_HUNGER_START: "9999",
    MOIRAI_HUNGER_DEATH: "9999",
    MOIRAI_FORCED_DEATHS: "alice:80",
  });
  const handle = await bootEngine(config);

  const seen: DomainEvent[] = [];
  let cursor = 0;
  let resolved = false;

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`smoke timeout — sequence stuck at ${REQUIRED_SEQUENCE[cursor] ?? "(end)"}`));
    }, 60_000);

    handle.bus.subscribe((event) => {
      seen.push(event);
      if (event.type === REQUIRED_SEQUENCE[cursor]) {
        cursor++;
        if (cursor === REQUIRED_SEQUENCE.length && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve();
        }
      }
    });
  });

  await handle.stop();
  console.log("SMOKE OK — full demo event sequence observed");
  console.log(`  saw ${seen.length} events; sequence completed in order.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("SMOKE FAIL:", err);
  process.exit(1);
});
