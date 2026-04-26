import { skillResolvesCrisis } from "@moirai/environment";
import type { Kernel } from "@moirai/kernel";
import {
  EventType,
  type AgentInWorld,
  type Crisis,
  type Environment,
} from "@moirai/shared";
import { sendToEngine } from "./parentIpc.js";
import type { SkillSet } from "./skillSet.js";

type TeachPayload = { kind: "TEACH"; skillId: string };
type DeathWarningPayload = { kind: "DEATH_WARNING"; crisisType: string; crisisDescription: string };

export type DecisionDeps = {
  agentId: string;
  environment: Environment;
  kernel: Kernel;
  skills: SkillSet;
  crisisCautions: Map<string, string>; // crisisType → caution note injected into evolve prompt
};

function isTeachPayload(x: unknown): x is TeachPayload {
  return typeof x === "object" && x !== null && (x as { kind?: unknown }).kind === "TEACH";
}

function isDeathWarning(x: unknown): x is DeathWarningPayload {
  return typeof x === "object" && x !== null && (x as { kind?: unknown }).kind === "DEATH_WARNING";
}

export function handleTick(_deps: DecisionDeps, _tick: number, me: AgentInWorld, _nearby: AgentInWorld[]): void {
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
    inventory: [],
    knownSkills: skills.all(),
  });

  if (result.status !== "accepted") return;

  skills.add(result.skill);
  await kernel.storage.putAgentInventory(agentId, skills.all().map((s) => s.id));
  await kernel.net.broadcast({ kind: "TEACH", skillId: result.skill.id });
  sendToEngine({
    kind: "EVENT",
    event: { type: EventType.SKILL_TAUGHT, tick, actorId: agentId, payload: { skillId: result.skill.id, to: "*", skill: result.skill } },
  });
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

  const skill = await kernel.storage.getSkill(skillId);
  if (!skill) return;

  skills.add(skill);
  await kernel.storage.putAgentInventory(agentId, skills.all().map((s) => s.id));
  sendToEngine({
    kind: "EVENT",
    event: { type: EventType.SKILL_LEARNED, tick, actorId: agentId, payload: { skillId, from: msg.from, skill } },
  });
}

export async function inheritOnSpawn(deps: DecisionDeps, tick: number, predecessorIds?: string[]): Promise<void> {
  if (!predecessorIds?.length) return;

  const seen = new Set<string>();
  for (const predecessorId of predecessorIds) {
    const ids = await deps.kernel.storage.getAgentInventory(predecessorId);
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
