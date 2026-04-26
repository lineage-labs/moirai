import { skillResolvesCrisis, skillCoversActivity } from "@moirai/environment";
import type { Kernel } from "@moirai/kernel";
import {
  EventType,
  type AgentAction,
  type AgentInWorld,
  type Crisis,
  type Environment,
  type Personality,
  type Skill,
} from "@moirai/shared";
import { sendToEngine } from "./parentIpc.js";
import type { SkillSet } from "./skillSet.js";
import type { ActivityQueue } from "./activityQueue.js";

type TeachPayload = { kind: "TEACH"; skillId: string; abstract: string };

export type DecisionDeps = {
  agentId: string;
  personality: Personality;
  environment: Environment;
  kernel: Kernel;
  skills: SkillSet;
  knownPeerIds: string[];
  activityQueue: ActivityQueue;
};

export function isTeachPayload(x: unknown): x is TeachPayload {
  return typeof x === "object" && x !== null && (x as { kind?: unknown }).kind === "TEACH";
}

export async function handleTick(deps: DecisionDeps, tick: number, me: AgentInWorld, nearby: AgentInWorld[]): Promise<void> {
  const { agentId, activityQueue, personality, environment, kernel, skills } = deps;

  const current = activityQueue.tick(tick);
  if (current) {
    sendToEngine({ kind: "ACTION", action: current });
    return;
  }

  // Build reason prompt — kernel.compute owns the LLM call, agent-runtime owns the prompt
  const needsSummary = `hunger=${me.needs.hunger}/100 energy=${me.needs.energy}/100 curiosity=${me.needs.curiosity}/100 food_stock=${me.food}`;
  const skillList = skills.all().map(s => `- ${s.name}: ${s.effect} (used ${s.useCount ?? 0}x)`).join("\n") || "(none)";
  const nearbyList = nearby.map(a => a.id).join(", ") || "nobody";

  const reasonPrompt = [
    `You are ${personality.name}. Traits: ${personality.traits.join(", ")}. Risk tolerance: ${personality.risk}.`,
    personality.promptFragments.reasoning ?? "",
    `Current needs: ${needsSummary}`,
    `Environment: ${environment.physics.join("; ")}`,
    `Resources available: ${environment.resources.join(", ")}`,
    `Known skills:\n${skillList}`,
    `Nearby agents: ${nearbyList}`,
    `Tick: ${tick}`,
    `Decide ONE action to address your most pressing need. Reply ONLY with JSON: { "action": "short phrase", "reason": "one sentence" }`,
    `Examples: { "action": "find berries to eat" } or { "action": "rest and recover energy" } or { "action": "experiment with grass bundles" }`,
  ].join("\n");

  let intendedAction: string;
  try {
    const resp = await kernel.compute.infer(reasonPrompt, { verifiable: false });
    const json = extractJson(resp.text);
    intendedAction = (JSON.parse(json) as { action: string }).action;
  } catch {
    intendedAction = me.needs.hunger > 50 ? "find food" : "rest";
  }

  // Find matching skill
  const matchingSkill = skills.all().find(s => skillCoversActivity(s, intendedAction));

  if (matchingSkill) {
    // Increment use count — skills grow through use
    const updated = { ...matchingSkill, useCount: (matchingSkill.useCount ?? 0) + 1 };
    skills.add(updated);
    void kernel.storage.putSkill(updated);

    const action = activityFromSkill(matchingSkill);
    activityQueue.start(action, tick, durationForAction(action.kind));
    sendToEngine({ kind: "EVENT", event: { type: EventType.ACTIVITY_STARTED, tick, actorId: agentId, payload: { activity: action.kind, skillId: matchingSkill.id } } });
    sendToEngine({ kind: "ACTION", action });

    // Skill growth: re-evolve when well-used and curious
    const growthThreshold = 8;
    if (updated.useCount >= growthThreshold && me.needs.curiosity >= 65) {
      void kernel.evolve({
        tick,
        situation: `improve my ${matchingSkill.name} technique after using it ${updated.useCount} times`,
        seedSkill: matchingSkill,
        inventory: me.inventory,
        knownSkills: skills.all(),
      }).then(result => {
        if (result.accepted) {
          skills.add(result.skill);
          // Teach the improvement to peers
          const peer = deps.knownPeerIds.find(p => p !== agentId);
          if (peer) void kernel.net.whisper(peer, { kind: "TEACH", skillId: result.skill.id, abstract: result.skill.description });
        }
      });
    }
    return;
  }

  // No skill covers the intended action — evolve a new one
  await kernel.evolve({
    tick,
    situation: intendedAction,
    inventory: me.inventory,
    knownSkills: skills.all(),
  }).then(result => {
    if (!result.accepted) return;
    skills.add(result.skill);
    const action = activityFromSkill(result.skill);
    activityQueue.start(action, tick, durationForAction(action.kind));
    sendToEngine({ kind: "ACTION", action });
    const peer = deps.knownPeerIds.find(p => p !== agentId);
    if (peer) void kernel.net.whisper(peer, { kind: "TEACH", skillId: result.skill.id, abstract: result.skill.description });
  });
}

export async function handleCrisis(deps: DecisionDeps, tick: number, crisis: Crisis): Promise<void> {
  const { kernel, environment, skills, agentId, knownPeerIds, activityQueue } = deps;

  const interrupted = activityQueue.interrupt();
  if (interrupted) {
    sendToEngine({
      kind: "EVENT",
      event: {
        type: EventType.ACTIVITY_INTERRUPTED,
        tick,
        actorId: agentId,
        payload: { activity: interrupted.kind, crisisId: crisis.id },
      },
    });
  }

  for (const skill of skills.all()) {
    if (skillResolvesCrisis(skill, crisis, environment)) {
      sendToEngine({
        kind: "ACTION",
        action: { kind: "APPLY_SKILL", skillId: skill.id, crisisId: crisis.id },
      });
      activityQueue.resume(tick);
      return;
    }
  }

  const result = await kernel.evolve({
    tick,
    situation: `${crisis.type} — ${crisis.description}`,
    crisis,
    inventory: [],
    knownSkills: skills.all(),
  });

  if (!result.accepted) {
    activityQueue.resume(tick);
    return;
  }

  skills.add(result.skill);

  const peer = pickPeerToTeach(knownPeerIds, agentId);
  if (peer) {
    await kernel.net.whisper(peer, {
      kind: "TEACH",
      skillId: result.skill.id,
      abstract: result.skill.description,
    } satisfies TeachPayload);

    sendToEngine({
      kind: "EVENT",
      event: {
        type: EventType.SKILL_TAUGHT,
        tick,
        actorId: agentId,
        payload: { skillId: result.skill.id, to: peer, skill: result.skill },
      },
    });
  }

  sendToEngine({
    kind: "ACTION",
    action: { kind: "APPLY_SKILL", skillId: result.skill.id, crisisId: crisis.id },
  });
  activityQueue.resume(tick);
}

export async function handlePeerMessage(
  deps: DecisionDeps,
  tick: number,
  msg: { from: string; payload: unknown },
): Promise<void> {
  if (!isTeachPayload(msg.payload)) return;
  const skillId = msg.payload.skillId;
  if (deps.skills.has(skillId)) return;

  let skill: Skill;
  try {
    skill = await deps.kernel.storage.getSkill(skillId);
  } catch {
    return;
  }

  deps.skills.add(skill);

  sendToEngine({
    kind: "EVENT",
    event: {
      type: EventType.SKILL_LEARNED,
      tick,
      actorId: deps.agentId,
      payload: { skillId, from: msg.from, skill },
    },
  });
}

export async function inheritOnSpawn(deps: DecisionDeps, tick: number): Promise<void> {
  const list = await deps.kernel.storage.listSkills();
  for (const skill of list) {
    if (deps.personality.innateSkills.includes(skill.id)) continue;
    if (deps.skills.has(skill.id)) continue;
    deps.skills.add(skill);
    sendToEngine({
      kind: "EVENT",
      event: {
        type: EventType.SKILL_INHERITED,
        tick,
        actorId: deps.agentId,
        payload: { skillId: skill.id, skill, from: skill.provenance.inventedBy },
      },
    });
  }
}

function activityFromSkill(skill: Skill): AgentAction {
  const text = `${skill.name} ${skill.effect} ${skill.description}`.toLowerCase();
  if (/rest|sleep|recover|energy/.test(text)) return { kind: "REST" };
  if (/forag|berr|gather|hunt|collect/.test(text)) return { kind: "FORAGE" };
  if (/farm|grow|plant|cultivat|grass/.test(text)) return { kind: "FARM" };
  if (/talk|social|communicat|chat/.test(text)) return { kind: "SOCIALIZE", targetId: "" }; // engine ignores empty targetId
  return { kind: "EXPERIMENT" };
}

function durationForAction(kind: string): number {
  if (kind === "REST") return 5;
  if (kind === "FORAGE") return 2;
  if (kind === "FARM") return 4;
  if (kind === "EXPERIMENT") return 8;
  return 3;
}

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("no JSON");
  return text.slice(start, end + 1);
}

function pickPeerToTeach(peers: string[], me: string): string | undefined {
  const candidates = peers.filter((p) => p !== me);
  if (candidates.length === 0) return undefined;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
