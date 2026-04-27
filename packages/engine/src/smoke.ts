import { EventType, type DomainEvent } from "@moirai/shared";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootEngine } from "./index.js";
import { loadConfig } from "./config.js";

const REQUIRED_MILESTONES: Array<EventType | EventType[]> = [
  EventType.REASONING_STARTED,
  EventType.SKILL_PROPOSED,
  EventType.SELF_EVAL_RESULT,
  [EventType.SKILL_ACCEPTED, EventType.SKILL_REJECTED], // one of the two must appear
  [EventType.AXL_WHISPER, EventType.AXL_BROADCAST],
  EventType.SKILL_REJECTED_BY_PEER,                    // at least one peer rejection expected
  EventType.CRISIS_STARTED,
  EventType.CRISIS_RESOLVED,
  EventType.AGENT_DIED,
  EventType.AGENT_SPAWNED,
];

function matchesStep(eventType: EventType, step: EventType | EventType[]): boolean {
  return Array.isArray(step) ? step.includes(eventType) : eventType === step;
}

function stepLabel(step: EventType | EventType[]): string {
  return Array.isArray(step) ? step.join(" | ") : step;
}

async function main(): Promise<void> {
  const freshEpisodeDir = mkdtempSync(join(tmpdir(), "moirai-smoke-"));
  const freshDevStorageDir = mkdtempSync(join(tmpdir(), "moirai-dev-storage-smoke-"));
  const config = loadConfig({
    ...process.env,
    MOIRAI_MAX_TICKS: "200",
    MOIRAI_TICK_MS: "50",
    MOIRAI_WS_PORT: "0",
    MOIRAI_INHERITORS: "dave,eve",
    MOIRAI_EPISODE_DIR: freshEpisodeDir,
    MOIRAI_DEV_STORAGE: freshDevStorageDir,
  });
  const handle = await bootEngine(config);

  const seen: DomainEvent[] = [...handle.bus.history()];
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("smoke timeout waiting for max ticks")), 60_000);
    handle.bus.subscribe((event) => {
      seen.push(event);
      if (event.type === EventType.WORLD_TICK && event.tick >= config.maxTicks) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  await handle.stop();

  const missing = REQUIRED_MILESTONES.filter(
    (step) => !seen.some((event) => matchesStep(event.type, step)),
  );
  if (missing.length > 0) {
    const counts = Object.entries(
      seen.reduce<Record<string, number>>((acc, event) => {
        acc[event.type] = (acc[event.type] ?? 0) + 1;
        return acc;
      }, {}),
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([type, count]) => `${type}:${count}`)
      .join(", ");
    throw new Error(`required milestones missing: ${missing.map(stepLabel).join(", ")}; seen top events: ${counts}`);
  }

  const hasDeath = seen.some((e) => e.type === EventType.AGENT_DIED && e.tick > 0);
  const hasSpawn = seen.some((e) => e.type === EventType.AGENT_SPAWNED && e.tick > 0);
  const hasCrisisTerminal = seen.some(
    (e) => e.type === EventType.CRISIS_RESOLVED && (e.payload.outcome === "resolved" || e.payload.outcome === "expired"),
  );
  if (!hasDeath || !hasSpawn || !hasCrisisTerminal) {
    throw new Error(
      `lifecycle assertions failed (death=${hasDeath}, spawn=${hasSpawn}, crisisTerminal=${hasCrisisTerminal})`,
    );
  }

  const inherited = seen.some((e) => e.type === EventType.SKILL_INHERITED);
  console.log("SMOKE OK — flow/lifecycle checks passed");
  console.log(`  saw ${seen.length} events; required milestones observed.`);
  console.log(`  inheritance observed: ${inherited ? "yes" : "no (depends on spawn proximity)"}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("SMOKE FAIL:", err);
  process.exit(1);
});
