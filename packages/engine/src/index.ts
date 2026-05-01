import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { createServer } from "node:http";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { loadEnvironment, skillResolvesCrisis } from "@moirai/environment";
import { loadPersonality } from "@moirai/personality";
import type { Event, Crisis, Skill } from "@moirai/shared";

const TICK_MS = parseInt(process.env["TICK_MS"] ?? "2000");
const WS_PORT = parseInt(process.env["WS_PORT"] ?? "8765");
const HTTP_PORT = parseInt(process.env["HTTP_PORT"] ?? "8766");
const AGENT_RUNTIME_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../agent-runtime",
);
const KEYS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../docker/axl/keys");

const AXL_URLS = [
  process.env["AXL_URL_1"] ?? "http://127.0.0.1:19002",
  process.env["AXL_URL_2"] ?? "http://127.0.0.1:19012",
  process.env["AXL_URL_3"] ?? "http://127.0.0.1:19022",
];
// Each adapter must use the PEM key that matches the daemon it connects to.
const AXL_KEY_PATHS: Record<string, string> = {
  [AXL_URLS[0]!]: join(KEYS_DIR, "alice.pem"),
  [AXL_URLS[1]!]: join(KEYS_DIR, "bob.pem"),
  [AXL_URLS[2]!]: join(KEYS_DIR, "charlie.pem"),
};

const environment = loadEnvironment();
const allEvents: Event[] = [];
const skills = new Map<string, { skill: Skill; rootHash: string }>();
let tick = 0;
let paused = false;

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
      const msg = JSON.parse(data.toString()) as { kind: string };
      if (msg.kind === "PAUSE") { paused = true; console.log("[engine] world PAUSED"); }
      else if (msg.kind === "RESUME") { paused = false; console.log("[engine] world RESUMED"); }
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

// --- Agent process tracking ---
type AgentEntry = {
  id: string;
  proc: ChildProcess;
  alive: boolean;
  knownSkillIds: Set<string>;
  hunger: number;
  hungerConfig?: { rate: number; threshold: number };
};

const agents = new Map<string, AgentEntry>();
let axlUrlIdx = 0;

function sendToAgent(entry: AgentEntry, msg: unknown): void {
  try {
    if (entry.alive) entry.proc.stdin!.write(JSON.stringify(msg) + "\n");
  } catch {
    // process may have exited
  }
}

function spawnAgent(id: string, inheritedSkillRoots: Record<string, string> = {}, ancestorDeaths: Array<{ agentId: string; reason: string }> = []): void {
  const axlUrl = AXL_URLS[axlUrlIdx++ % AXL_URLS.length]!;
  const peerIds = [...agents.keys()];

  const axlKeyPath = AXL_KEY_PATHS[axlUrl] ?? "";
  const proc = spawn("node", ["--import", "tsx/esm", "src/index.ts"], {
    cwd: AGENT_RUNTIME_DIR,
    stdio: ["pipe", "pipe", "inherit"],
    env: { ...process.env, AGENT_ID: id, PERSONALITY_ID: id, AXL_URL: axlUrl, AXL_KEY_PATH: axlKeyPath },
  });

  const personality = loadPersonality(id);
  const entry: AgentEntry = {
    id,
    proc,
    alive: true,
    knownSkillIds: new Set(),
    hunger: 0,
    ...(personality.hunger ? { hungerConfig: personality.hunger } : {}),
  };
  agents.set(id, entry);

  sendToAgent(entry, { kind: "BOOT", peerIds, inheritedSkillRoots, ...(ancestorDeaths.length ? { ancestorDeaths } : {}) });

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

    // Internal: skill root hash from 0G Storage
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
    }
    if (event.kind === "SKILL_LEARNED" || event.kind === "SKILL_INHERITED") {
      entry.knownSkillIds.add(event.payload.skillId);
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

    // Spawn next replacement inheriting the dying agent's skills and cause of death
    if (replacementIdx < REPLACEMENT_POOL.length) {
      const nextId = REPLACEMENT_POOL[replacementIdx++]!;
      const inheritedSkillRoots: Record<string, string> = {};
      for (const skillId of entry.knownSkillIds) {
        const s = skills.get(skillId);
        if (s?.rootHash) inheritedSkillRoots[skillId] = s.rootHash;
      }
      const deathReason = code === 0 ? "hunger" : `exit code ${code}`;
      setTimeout(() => {
        spawnAgent(nextId, inheritedSkillRoots, [{ agentId: id, reason: deathReason }]);
        broadcastPeerList();
      }, 3 * TICK_MS);
    }
  });

  broadcast({ kind: "AGENT_SPAWNED", tick, actorId: id, payload: { personalityId: id, traits: personality.traits ?? [] } });
}

// Notify all agents of the current peer list (called after all initial agents are spawned)
function broadcastPeerList(): void {
  const allIds = [...agents.keys()];
  for (const agent of agents.values()) {
    if (!agent.alive) continue;
    const peers = allIds.filter((id) => id !== agent.id);
    sendToAgent(agent, { kind: "PEERS", peerIds: peers });
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
      const individuallyResolved = perCrisisResolvedAgents.get(crisisId) ?? new Set<string>();
      individuallyResolved.add(agentId);
      perCrisisResolvedAgents.set(crisisId, individuallyResolved);
    }

    const allResolved = crisis.targets.every((targetId) => {
      const a = agents.get(targetId);
      if (!a?.alive) return true;
      return agentCanResolve(targetId, crisis);
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

// Pool of agents spawned (in order) whenever any agent dies, inheriting the dying agent's skills.
const REPLACEMENT_POOL = ["dave", "eve", "frank", "grace", "henry"];
let replacementIdx = 0;

// --- Tick loop ---
function doTick(): void {
  if (paused) return;
  tick++;
  broadcast({ kind: "WORLD_TICK", tick, actorId: "engine" });

  // Hunger: increment per tick, broadcast current level, kill when threshold reached
  for (const agent of agents.values()) {
    if (!agent.alive || !agent.hungerConfig) continue;
    agent.hunger += agent.hungerConfig.rate;
    broadcast({
      kind: "AGENT_HUNGER",
      tick,
      actorId: agent.id,
      payload: { hunger: agent.hunger, threshold: agent.hungerConfig.threshold },
    });
    if (agent.hunger >= agent.hungerConfig.threshold) {
      agent.proc.stdin!.write(JSON.stringify({ kind: "DIE", reason: "hunger" }) + "\n");
      agent.alive = false;
      broadcast({ kind: "AGENT_DIED", tick, actorId: agent.id, payload: { reason: "hunger" } });
    }
  }

  // Crisis deadline enforcement
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

  // Inject crises from environment schedule
  const newCrisesByAgent = new Map<string, Crisis[]>();
  for (const entry of environment.crisisSchedule) {
    if (entry.tick !== tick) continue;
    const crisisId = `${entry.type}-${tick}`;
    const targets = (entry.targets ?? [...agents.keys()]).filter(id => agents.get(id)?.alive);
    const crisis: Crisis = {
      id: crisisId,
      type: entry.type,
      description:
        entry.type === "LION"
          ? "A lion appears, threatening nearby agents!"
          : `A ${entry.type.toLowerCase()} crisis strikes!`,
      startedAtTick: tick,
      deadlineTicks: entry.deadlineTicks,
      targets,
    };
    activeCrises.set(crisisId, crisis);
    broadcast({ kind: "CRISIS_STARTED", tick, actorId: "engine", payload: crisis });
    for (const targetId of targets) {
      const list = newCrisesByAgent.get(targetId) ?? [];
      list.push(crisis);
      newCrisesByAgent.set(targetId, list);
    }
  }

  // One TICK per alive agent
  for (const agent of agents.values()) {
    if (!agent.alive) continue;
    const crises = newCrisesByAgent.get(agent.id) ?? [];
    sendToAgent(agent, { kind: "TICK", tick, crises });
  }
}

// --- Demo controller HTTP endpoint ---
createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/crisis") {
    res.writeHead(404).end();
    return;
  }
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const body = JSON.parse(Buffer.concat(chunks).toString()) as {
      type: string;
      targets?: string[];
    };
    const crisisId = `${body.type}-manual-${tick}`;
    const targets = (body.targets ?? [...agents.keys()]).filter(id => agents.get(id)?.alive);
    const crisis: Crisis = {
      id: crisisId,
      type: body.type.toUpperCase(),
      description: `Manual ${body.type.toLowerCase()} crisis!`,
      startedAtTick: tick,
      deadlineTicks: 25,
      targets,
    };
    activeCrises.set(crisisId, crisis);
    broadcast({ kind: "CRISIS_STARTED", tick, actorId: "engine", payload: crisis });
    for (const targetId of targets) {
      const agent = agents.get(targetId);
      if (agent?.alive) sendToAgent(agent, { kind: "TICK", tick, crises: [crisis] });
    }
    res.writeHead(200, { "Content-Type": "application/json" }).end(
      JSON.stringify({ ok: true, crisisId }),
    );
  });
}).listen(HTTP_PORT, () => console.log(`[engine] HTTP on :${HTTP_PORT}`));

// --- Boot ---
async function main(): Promise<void> {
  const initialAgents = ["alice", "bob", "charlie"];
  for (const id of initialAgents) {
    spawnAgent(id);
    await new Promise((r) => setTimeout(r, 300));
  }

  // Send each agent the full initial peer list now that everyone is spawned
  broadcastPeerList();

  console.log(`[engine] tick loop started (${TICK_MS}ms per tick)`);
  setInterval(doTick, TICK_MS);
}

main().catch(console.error);
