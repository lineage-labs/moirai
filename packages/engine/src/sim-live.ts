/**
 * sim-live — 50-second real simulation against live 0G + AXL infrastructure.
 *
 * Prerequisites:
 *   - docker-compose.axl.yml running (ports 19002/19012/19022)
 *   - .env loaded with ZG_RPC_URL, ZG_PRIVATE_KEY, ZG_INDEXER_URL (+ optional FALLBACK_*)
 *
 * Run:
 *   pnpm --filter @moirai/engine sim-live
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EventType, type DomainEvent } from "@moirai/shared";
import { bootEngine } from "./index.js";
import { loadConfig } from "./config.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROD_KERNEL_MODULE = resolve(HERE, "..", "..", "kernel-impl", "src", "prodKernel.ts");

const AXL_URLS = [
  process.env.AXL_URL_1 ?? "http://127.0.0.1:19002",
  process.env.AXL_URL_2 ?? "http://127.0.0.1:19012",
  process.env.AXL_URL_3 ?? "http://127.0.0.1:19022",
  process.env.AXL_URL_4 ?? "http://127.0.0.1:19032",
  process.env.AXL_URL_5 ?? "http://127.0.0.1:19042",
];

// ── ANSI helpers ────────────────────────────────────────────────────────────

const C = {
  reset:  "\x1b[0m",
  dim:    "\x1b[2m",
  bold:   "\x1b[1m",
  red:    "\x1b[31m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  magenta:"\x1b[35m",
  blue:   "\x1b[34m",
  white:  "\x1b[37m",
};

const LABELS: Record<string, [string, string]> = {
  "0G":      [C.cyan,    "0G      "],
  "AXL":     [C.magenta, "AXL     "],
  "CRISIS":  [C.red,     "CRISIS  "],
  "RESOLVE": [C.green,   "RESOLVE "],
  "SPAWN":   [C.blue,    "SPAWN   "],
  "DIED":    [C.red,     "DIED    "],
  "LEARN":   [C.green,   "LEARN   "],
  "INHERIT": [C.cyan,    "INHERIT "],
  "VILLAGE": [C.dim,     "VILLAGE "],
};

function label(tag: string, tick: number, actor: string, msg: string): void {
  const [color, pad] = LABELS[tag] ?? [C.white, tag.padEnd(8)];
  const t = String(tick).padStart(4, "0");
  const a = actor.padEnd(8).slice(0, 8);
  process.stdout.write(`${C.dim}[t=${t}]${C.reset} ${color}${pad}${C.reset} ${C.dim}${a}${C.reset}  ${msg}\n`);
}

function receipt(hash: string | undefined): string {
  if (!hash) return "";
  const short = hash.slice(0, 10);
  return `  ${C.dim}receipt=${short}…${C.reset}`;
}

function p(e: DomainEvent): Record<string, unknown> {
  return e.payload as Record<string, unknown>;
}

// ── AXL preflight ───────────────────────────────────────────────────────────

async function fetchTopology(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${url}/topology`, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`${url}/topology → HTTP ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}

const AXL_NAMES = ["alice", "bob", "charlie", "dave", "eve"];

async function axlPreflight(): Promise<void> {
  process.stdout.write(`\n${C.bold}── AXL preflight ──${C.reset}\n`);
  for (let i = 0; i < AXL_URLS.length; i++) {
    const url = AXL_URLS[i]!;
    try {
      const t = await fetchTopology(url);
      const pk = String((t as Record<string, unknown>).our_public_key ?? "").slice(0, 16);
      process.stdout.write(`  ${C.green}✓${C.reset}  ${(AXL_NAMES[i] ?? `node-${i+1}`).padEnd(7)}  ${url}  pubkey=${pk}…\n`);
    } catch (err) {
      process.stderr.write(`  ${C.red}✗${C.reset}  ${(AXL_NAMES[i] ?? `node-${i+1}`).padEnd(7)}  ${url}  ${(err as Error).message}\n`);
      process.stderr.write(`\n${C.red}AXL preflight failed.${C.reset} Start the mesh first:\n`);
      process.stderr.write(`  docker compose -f docker-compose.axl.yml up -d\n\n`);
      process.exit(1);
    }
  }
  process.stdout.write(`\n`);
}

// ── env setup ───────────────────────────────────────────────────────────────

function setupEnv(): void {
  // Activate the real kernel (prodKernel reads 0G + AXL adapters)
  process.env.MOIRAI_KERNEL_MODE   = "prod";
  process.env.MOIRAI_KERNEL_MODULE = PROD_KERNEL_MODULE;

  // Per-agent AXL URLs (alice→node1, bob→node2, all others→node3)
  process.env.MOIRAI_AXL_URL_alice   = AXL_URLS[0];
  process.env.MOIRAI_AXL_URL_bob     = AXL_URLS[1];
  process.env.MOIRAI_AXL_URL_cara    = AXL_URLS[2];
  process.env.MOIRAI_AXL_URL_dave    = AXL_URLS[3];
  process.env.MOIRAI_AXL_URL_eve     = AXL_URLS[4];

  // Disable WS browser bridge (not needed in headless sim)
  process.env.MOIRAI_WS_PORT = "0";
}

// ── event formatter ─────────────────────────────────────────────────────────

type Stats = {
  zgCalls:    number;
  axlMsgs:    number;
  crises:     number;
  resolved:   number;
  skillsMade: number;
  deaths:     number;
  spawns:     number;
  inherited:  number;
};

function formatEvent(e: DomainEvent, stats: Stats): void {
  const tick   = e.tick;
  const actor  = e.actorId;
  const pl     = p(e);

  switch (e.type) {
    // ── crisis ────────────────────────────────────────────────────────────
    case EventType.CRISIS_STARTED: {
      stats.crises++;
      const affected = (pl.affected as string[] | undefined)?.join(", ") ?? "?";
      const deadline = pl.deadlineTick ? `+${Number(pl.deadlineTick) - tick} ticks` : "";
      label("CRISIS", tick, actor,
        `${C.bold}${String(pl.type ?? pl.crisisId ?? "crisis")}${C.reset} → ${affected}  ${C.dim}deadline=${deadline}${C.reset}`);
      break;
    }
    case EventType.CRISIS_RESOLVED: {
      stats.resolved++;
      const by = pl.skillName ? `via ${String(pl.skillName)}` : String(pl.outcome ?? "expired");
      label("RESOLVE", tick, actor, `${pl.crisisId ?? "?"}  ${by}`);
      break;
    }

    // ── 0G compute ────────────────────────────────────────────────────────
    case EventType.REASONING_STARTED: {
      stats.zgCalls++;
      const crisis = pl.crisisId ? `[crisis:${pl.crisisId}]` : "[curiosity]";
      label("0G", tick, actor,
        `reasoning…  ${C.dim}${crisis}  (sealed)${C.reset}`);
      break;
    }
    case EventType.SKILL_PROPOSED: {
      const name = pl.name ?? (pl.candidate as Record<string, unknown> | undefined)?.name ?? "?";
      label("0G", tick, actor,
        `↳ proposed: ${C.bold}${String(name)}${C.reset}${receipt(e.receiptHash)}`);
      break;
    }
    case EventType.SELF_EVAL_RESULT: {
      stats.zgCalls++;
      const score = typeof pl.score === "number" ? pl.score.toFixed(2) : "?";
      const modes = (pl.failureModes as string[] | undefined)?.slice(0, 2).join(", ") ?? "";
      label("0G", tick, actor,
        `↳ self-eval  score=${C.bold}${score}${C.reset}${modes ? `  [${modes}]` : ""}${receipt(e.receiptHash)}`);
      break;
    }
    case EventType.SKILL_ACCEPTED: {
      stats.skillsMade++;
      const name = pl.name ?? (pl.skill as Record<string, unknown> | undefined)?.name ?? String(pl.skillId ?? "?");
      label("0G", tick, actor,
        `${C.green}✓ accepted${C.reset}  ${C.bold}${String(name)}${C.reset}  stored → 0G Storage${receipt(e.receiptHash)}`);
      break;
    }
    case EventType.SKILL_REJECTED: {
      const score = typeof pl.score === "number" ? pl.score.toFixed(2) : "?";
      const modes = (pl.failureModes as string[] | undefined)?.slice(0, 2).join(", ") ?? "";
      label("0G", tick, actor,
        `${C.red}✗ rejected${C.reset}  score=${score}${modes ? `  [${modes}]` : ""}${receipt(e.receiptHash)}`);
      break;
    }

    // ── AXL network ───────────────────────────────────────────────────────
    case EventType.AXL_WHISPER:
    case EventType.AXL_BROADCAST: {
      stats.axlMsgs++;
      const to   = pl.to ? `whisper→${String(pl.to)}` : "broadcast";
      const body = pl.payload as Record<string, unknown> | undefined;
      const kind = body?.kind ?? body?.type ?? "msg";
      const sname = body?.skillName ?? (body?.skill as Record<string, unknown> | undefined)?.name ?? "";
      const detail = sname ? `  ${String(sname)}` : "";
      label("AXL", tick, actor, `→ ${to}  ${C.dim}${String(kind)}${detail}${C.reset}`);
      break;
    }
    case EventType.SKILL_TAUGHT: {
      stats.axlMsgs++;
      const to = String(pl.to ?? "peer");
      const name = String(pl.skillName ?? pl.name ?? "?");
      label("AXL", tick, actor, `→ whisper→${to}  TEACH: ${name}`);
      break;
    }
    case EventType.SKILL_LEARNED: {
      const from = String(pl.from ?? pl.peerId ?? "peer");
      const name = String(pl.skillName ?? pl.name ?? "?");
      label("AXL", tick, actor, `← received  ${C.bold}${name}${C.reset}  from=${from}`);
      break;
    }

    // ── agent lifecycle ───────────────────────────────────────────────────
    case EventType.AGENT_SPAWNED: {
      stats.spawns++;
      const fresh = pl.fresh ? " fresh" : "";
      const inherited = pl.inheritedFrom
        ? `  inherited-from=[${(pl.inheritedFrom as string[]).join(",")}]`
        : "";
      label("SPAWN", tick, actor,
        `${C.bold}${actor}${C.reset}  personality=${String(pl.personalityId ?? "?")}${fresh}${inherited}`);
      break;
    }
    case EventType.AGENT_DIED: {
      stats.deaths++;
      label("DIED", tick, actor,
        `${C.red}${C.bold}${actor}${C.reset}  reason=${String(pl.reason ?? "unknown")}`);
      break;
    }

    // ── skill inheritance ─────────────────────────────────────────────────
    case EventType.SKILL_INHERITED: {
      stats.inherited++;
      const name = String(pl.skillName ?? pl.name ?? "?");
      const from = String(pl.from ?? pl.inventedBy ?? "unknown");
      label("INHERIT", tick, actor, `${C.bold}${name}${C.reset}  from=${from}`);
      break;
    }
    case EventType.SKILL_ACCEPTED_FROM_PEER: {
      const name = String(pl.skillName ?? pl.name ?? "?");
      const from = String(pl.from ?? pl.peerId ?? "peer");
      label("LEARN", tick, actor, `${C.bold}${name}${C.reset}  accepted from ${from}`);
      break;
    }
    case EventType.SKILL_REJECTED_BY_PEER: {
      const name = String(pl.skillName ?? pl.name ?? "?");
      label("LEARN", tick, actor, `${C.dim}${name} rejected (peer)${C.reset}`);
      break;
    }

    // ── ignored (noise) ───────────────────────────────────────────────────
    case EventType.WORLD_TICK:
    case EventType.FOOD_GATHERED:
    case EventType.SELF_EVAL_STARTED:
    case EventType.EPISODE_SAVED:
    case EventType.EPISODE_LOADED:
    case EventType.DEATH_WARNING:
      break;

    default:
      label("VILLAGE", tick, actor, `${C.dim}${e.type}${C.reset}`);
  }
}

// ── recap ───────────────────────────────────────────────────────────────────

function printRecap(stats: Stats, durationMs: number): void {
  const s = (durationMs / 1000).toFixed(1);
  process.stdout.write(`\n${C.bold}══════════════════ simulation complete (${s}s) ══════════════════${C.reset}\n`);
  process.stdout.write(`  ${C.cyan}0G calls${C.reset}      ${stats.zgCalls}\n`);
  process.stdout.write(`  ${C.magenta}AXL messages${C.reset}  ${stats.axlMsgs}\n`);
  process.stdout.write(`  crises        ${stats.crises}  (resolved: ${stats.resolved})\n`);
  process.stdout.write(`  skills minted ${stats.skillsMade}\n`);
  process.stdout.write(`  inherited     ${stats.inherited}\n`);
  process.stdout.write(`  deaths        ${stats.deaths}  spawns: ${stats.spawns}\n`);
  process.stdout.write(`${"═".repeat(60)}\n\n`);
}

// ── main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await axlPreflight();
  setupEnv();

  const resume = process.argv.includes("--resume");
  const config = loadConfig({
    ...process.env,
    MOIRAI_TICK_MS:  "250",
    MOIRAI_MAX_TICKS: "200",
    MOIRAI_WS_PORT:  "0",
    MOIRAI_EPISODE_DIR: "/tmp/moirai-live-episodes",
    MOIRAI_RESUME: resume ? "true" : "false",
  });

  process.stdout.write(`${C.bold}── moirai live simulation ──${C.reset}\n`);
  process.stdout.write(`  kernel:  ${C.cyan}prod${C.reset}  (0G Compute + 0G Storage + AXL)\n`);
  process.stdout.write(`  agents:  ${config.agents.map((a) => a.agentId).join(", ")}\n`);
  process.stdout.write(`  ticks:   ${config.maxTicks} × ${config.tickIntervalMs}ms = ${(config.maxTicks * config.tickIntervalMs / 1000).toFixed(0)}s\n`);
  process.stdout.write(`  module:  ${C.dim}${PROD_KERNEL_MODULE}${C.reset}\n\n`);

  const stats: Stats = {
    zgCalls: 0, axlMsgs: 0, crises: 0, resolved: 0,
    skillsMade: 0, deaths: 0, spawns: 0, inherited: 0,
  };

  const startMs = Date.now();
  const { stop, bus } = await bootEngine(config);

  bus.subscribe((e) => formatEvent(e, stats));

  await new Promise<void>((resolve) => {
    bus.subscribe((e) => {
      if (e.type === EventType.EPISODE_SAVED) {
        setTimeout(() => resolve(), 500);
      }
    });
  });

  await stop();
  printRecap(stats, Date.now() - startMs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
