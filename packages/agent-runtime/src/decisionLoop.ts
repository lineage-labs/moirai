import { skillResolvesCrisis } from "@moirai/environment";
import type { Kernel } from "@moirai/kernel";
import {
  EventType,
  type AgentInWorld,
  type Crisis,
  type Environment,
  type Personality,
} from "@moirai/shared";
import { sendToEngine } from "./parentIpc.js";
import type { SkillSet } from "./skillSet.js";
import { localGetSkill, localGetInventory, localPutInventory } from "./localFallback.js";

type TeachPayload = { kind: "TEACH"; skillId: string };
type DeathWarningPayload = { kind: "DEATH_WARNING"; crisisType: string; crisisDescription: string };

export type DecisionDeps = {
  agentId: string;
  personality: Personality;
  environment: Environment;
  kernel: Kernel;
  skills: SkillSet;
  crisisCautions: Map<string, string>; // crisisType → caution note injected into evolve prompt
  me?: AgentInWorld;
};

function isTeachPayload(x: unknown): x is TeachPayload {
  return typeof x === "object" && x !== null && (x as { kind?: unknown }).kind === "TEACH";
}

function isDeathWarning(x: unknown): x is DeathWarningPayload {
  return typeof x === "object" && x !== null && (x as { kind?: unknown }).kind === "DEATH_WARNING";
}

export function handleTick(deps: DecisionDeps, _tick: number, me: AgentInWorld, _nearby: AgentInWorld[]): void {
  deps.me = me;
  if (me.food <= 20 || me.needs.hunger >= 50) {
    sendToEngine({ kind: "ACTION", action: { kind: "FORAGE" } });
  } else {
    sendToEngine({ kind: "ACTION", action: { kind: "MOVE", dx: (Math.random() - 0.5) * 20, dy: (Math.random() - 0.5) * 20 } });
  }
}

export async function handleCrisis(deps: DecisionDeps, tick: number, crisis: Crisis): Promise<void> {
  const { kernel, environment, skills, agentId, crisisCautions } = deps;

  for (const skill of skills.all()) {
    if (skillResolvesCrisis(skill, crisis, environment)) {
      sendToEngine({ kind: "ACTION", action: { kind: "APPLY_SKILL", skillId: skill.id, crisisId: crisis.id } });
      return;
    }
  }

  const caution = crisisCautions.get(crisis.type.toLowerCase());
  const situation = caution
    ? `${crisis.type} — ${crisis.description}. NOTE: ${caution}`
    : `${crisis.type} — ${crisis.description}`;

  const result = await kernel.evolve({
    tick,
    situation,
    crisis,
    inventory: deps.me?.inventory ?? [],
    knownSkills: skills.all(),
  });

  if (result.status !== "accepted") return;

  skills.add(result.skill);
  const skillIds = skills.all().map((s) => s.id);
  try {
    await kernel.storage.putAgentInventory(agentId, skillIds);
  } catch {
    await localPutInventory(agentId, skillIds);
  }
  await kernel.net.broadcast({ kind: "TEACH", skillId: result.skill.id, skillName: result.skill.name });
  sendToEngine({ kind: "PEER_BROADCAST", payload: { kind: "TEACH", skillId: result.skill.id, skillName: result.skill.name } });
  sendToEngine({ kind: "ACTION", action: { kind: "APPLY_SKILL", skillId: result.skill.id, crisisId: crisis.id } });
}

export async function handlePeerMessage(
  deps: DecisionDeps,
  tick: number,
  msg: { from: string; payload: unknown },
): Promise<void> {
  const { agentId, kernel, skills, crisisCautions } = deps;

  if (isDeathWarning(msg.payload)) {
    const { crisisType, crisisDescription } = msg.payload;
    crisisCautions.set(crisisType.toLowerCase(), `a peer died facing a ${crisisType} (${crisisDescription}) — find a better approach.`);
    sendToEngine({
      kind: "EVENT",
      event: { type: EventType.DEATH_WARNING, tick, actorId: agentId, payload: { from: msg.from, crisisType, crisisDescription } },
    });
    return;
  }

  if (!isTeachPayload(msg.payload)) return;

  const { skillId } = msg.payload;
  if (skills.has(skillId)) return;

  const skill = (await kernel.storage.getSkill(skillId)) ?? (await localGetSkill(skillId));
  if (!skill) return;

  // Personality filter: does this skill fit who I am?
  const { personality } = deps;
  const prompt = [
    `You are ${personality.name}. Traits: ${personality.traits.join(", ")}. Risk tolerance: ${personality.risk}.`,
    `A peer is offering to teach you: "${skill.name}" — ${skill.description}`,
    `Effect: ${skill.effect}  |  Quality score: ${skill.provenance.selfEvalScore.toFixed(2)}/1.0`,
    `Would you adopt this skill given your personality? Reply ONLY with JSON: {"accept": boolean}`,
  ].join("\n");

  let accepted = true;
  try {
    const resp = await kernel.compute.infer(prompt, { verifiable: false });
    const start = resp.text.indexOf("{");
    const end = resp.text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      accepted = (JSON.parse(resp.text.slice(start, end + 1)) as { accept: boolean }).accept;
    }
  } catch {
    // fallback: accept
  }

  if (!accepted) {
    sendToEngine({
      kind: "EVENT",
      event: { type: EventType.SKILL_REJECTED_BY_PEER, tick, actorId: agentId, payload: { skillId, from: msg.from, reason: "personality_mismatch" } },
    });
    return;
  }

  skills.add(skill);
  const peerSkillIds = skills.all().map((s) => s.id);
  try {
    await kernel.storage.putAgentInventory(agentId, peerSkillIds);
  } catch {
    await localPutInventory(agentId, peerSkillIds);
  }
  sendToEngine({
    kind: "EVENT",
    event: { type: EventType.SKILL_ACCEPTED_FROM_PEER, tick, actorId: agentId, payload: { skillId, skillName: skill.name, from: msg.from } },
  });
  sendToEngine({
    kind: "EVENT",
    event: { type: EventType.SKILL_LEARNED, tick, actorId: agentId, payload: { skillId, skillName: skill.name, from: msg.from, skill } },
  });
}

export async function inheritOnSpawn(deps: DecisionDeps, tick: number, predecessorIds?: string[]): Promise<void> {
  if (!predecessorIds?.length) return;

  const seen = new Set<string>();
  for (const predecessorId of predecessorIds) {
    let ids = await deps.kernel.storage.getAgentInventory(predecessorId);
    if (ids.length === 0) ids = await localGetInventory(predecessorId);
    for (const skillId of ids) {
      if (seen.has(skillId) || deps.skills.has(skillId)) continue;
      seen.add(skillId);
      const skill = await deps.kernel.storage.getSkill(skillId);
      if (!skill) continue;
      deps.skills.add(skill);
      sendToEngine({
        kind: "EVENT",
        event: { type: EventType.SKILL_INHERITED, tick, actorId: deps.agentId, payload: { skillId: skill.id, skill, from: skill.provenance.inventedBy } },
      });
    }
  }
  if (seen.size > 0) {
    await deps.kernel.storage.putAgentInventory(deps.agentId, deps.skills.all().map((s) => s.id));
  }
}
