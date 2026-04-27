import { skillResolvesCrisis } from "@moirai/environment";
import type { Kernel } from "@moirai/kernel";
import {
  EventType,
  type AgentInWorld,
  type Crisis,
  type Environment,
  type Personality,
  type Skill,
} from "@moirai/shared";
import { sendToEngine } from "./parentIpc.js";
import type { SkillSet } from "./skillSet.js";
import { localGetSkill, localGetInventory, localListSkills, localPutInventory, localPutCautions, localGetCautions } from "./localFallback.js";

type TeachPayload = { kind: "TEACH"; skillId: string };
type DeathWarningPayload = { kind: "DEATH_WARNING"; crisisType: string; crisisDescription: string; skillTried?: string; failureModes?: string[] };

export type DecisionDeps = {
  agentId: string;
  personality: Personality;
  environment: Environment;
  kernel: Kernel;
  skills: SkillSet;
  crisisCautions: Map<string, string>; // crisisType → caution note injected into evolve prompt
  lastAttempts: Map<string, { skillName: string; failureModes: string[] }>; // crisisType → what was tried
  deadPeers: Set<string>;
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

  if (result.status !== "accepted") {
    const key = crisis.type.toLowerCase();
    const skillName = result.candidateName;
    deps.lastAttempts.set(key, { skillName, failureModes: result.failureModes });
    const selfCaution = `A previous agent died facing a ${crisis.type} crisis. They tried "${skillName}". Approach differently.`;
    crisisCautions.set(key, selfCaution);
    const snapshot = Object.fromEntries(crisisCautions);
    kernel.storage.putAgentCautions(agentId, snapshot).catch(() => localPutCautions(agentId, snapshot));
    return;
  }

  skills.add(result.skill);
  sendToEngine({ kind: "ACTION", action: { kind: "APPLY_SKILL", skillId: result.skill.id, crisisId: crisis.id } });

  persistAndTeach(deps, tick, agentId, result.skill);
}

async function persistAndTeach(deps: DecisionDeps, tick: number, agentId: string, skill: Skill): Promise<void> {
  const { kernel } = deps;
  const skillIds = deps.skills.all().map((s) => s.id);
  kernel.storage.putAgentInventory(agentId, skillIds).catch(() => localPutInventory(agentId, skillIds));

  const teachPayload = { kind: "TEACH", skillId: skill.id, skillName: skill.name };
  const alivePeers = (await kernel.net.topology()).filter((id) => !deps.deadPeers.has(id)).sort();
  const targets = alivePeers.slice(0, Math.ceil(alivePeers.length / 2));
  for (const peerId of targets) {
    sendToEngine({ kind: "EVENT", event: { type: EventType.AXL_WHISPER, tick, actorId: agentId, payload: { to: peerId, payload: teachPayload } } });
    await kernel.net.whisper(peerId, teachPayload);
  }
}


export async function handlePeerMessage(
  deps: DecisionDeps,
  tick: number,
  msg: { from: string; payload: unknown },
): Promise<void> {
  const { agentId, kernel, skills, crisisCautions } = deps;

  if (isDeathWarning(msg.payload)) {
    const { crisisType, skillTried } = msg.payload;
    deps.deadPeers.add(msg.from);
    const caution = `A peer died facing a ${crisisType} crisis${skillTried ? `. They tried "${skillTried}"` : ""}. Approach differently.`;
    crisisCautions.set(crisisType.toLowerCase(), caution);
    const cautionSnapshot = Object.fromEntries(crisisCautions);
    kernel.storage.putAgentCautions(agentId, cautionSnapshot).catch(() => localPutCautions(agentId, cautionSnapshot));
    sendToEngine({
      kind: "EVENT",
      event: { type: EventType.DEATH_WARNING, tick, actorId: agentId, payload: { from: msg.from, crisisType, skillTried, caution } },
    });
    return;
  }

  if (!isTeachPayload(msg.payload)) return;

  const { skillId } = msg.payload;
  if (skills.has(skillId)) return;

  const skill = (await kernel.storage.getSkill(skillId)) ?? (await localGetSkill(skillId));
  if (!skill) return;

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
  // Initial agents start with no skills — only respawned inheritors inherit
  if (!predecessorIds?.length) return;

  const seen = new Set<string>();

  function emitInherited(skill: Skill): void {
    deps.skills.add(skill);
    sendToEngine({
      kind: "EVENT",
      event: {
        type: EventType.SKILL_INHERITED,
        tick,
        actorId: deps.agentId,
        payload: { skillId: skill.id, skillName: skill.name, skill, from: skill.provenance.inventedBy },
      },
    });
  }

  // Collect skill IDs from predecessor inventories (try 0G Storage, then local fallback)
  const lineageIds: string[] = [];
  for (const predecessorId of predecessorIds) {
    let ids = await deps.kernel.storage.getAgentInventory(predecessorId);
    if (ids.length === 0) ids = await localGetInventory(predecessorId);
    for (const id of ids) {
      if (!seen.has(id)) { seen.add(id); lineageIds.push(id); }
    }
  }
  for (const skillId of lineageIds) {
    if (deps.skills.has(skillId)) continue;
    const skill = (await deps.kernel.storage.getSkill(skillId)) ?? (await localGetSkill(skillId));
    if (skill) emitInherited(skill);
  }

  if (seen.size > 0) {
    await deps.kernel.storage.putAgentInventory(deps.agentId, deps.skills.all().map((s) => s.id)).catch(() =>
      localPutInventory(deps.agentId, deps.skills.all().map((s) => s.id)),
    );
  }

  for (const predecessorId of predecessorIds) {
    let inherited: Record<string, string>;
    try {
      inherited = await deps.kernel.storage.getAgentCautions(predecessorId);
      if (Object.keys(inherited).length === 0) inherited = await localGetCautions(predecessorId);
    } catch {
      inherited = await localGetCautions(predecessorId);
    }
    for (const [crisisType, caution] of Object.entries(inherited)) {
      if (!deps.crisisCautions.has(crisisType)) deps.crisisCautions.set(crisisType, caution);
    }
  }
  if (deps.crisisCautions.size > 0) {
    const snapshot = Object.fromEntries(deps.crisisCautions);
    deps.kernel.storage.putAgentCautions(deps.agentId, snapshot).catch(() => localPutCautions(deps.agentId, snapshot));
  }
}
