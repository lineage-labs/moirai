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
type DeathWarningPayload = {
  kind: "DEATH_WARNING";
  cause: string;
  activeCrises: { type: string; description: string; id: string }[];
  lastAttempt?: { skillName: string; skillEffect: string };
};

export type CautionEntry = {
  crisisType: string;
  crisisDescription: string;
  cause: string;
  lastAttempt?: { skillName: string; skillEffect: string } | undefined;
  tick: number;
};

export type DecisionDeps = {
  agentId: string;
  personality: Personality;
  environment: Environment;
  kernel: Kernel;
  skills: SkillSet;
  knownPeerIds: string[];
  activityQueue: ActivityQueue;
  cautionList: CautionEntry[];
};

export function isTeachPayload(x: unknown): x is TeachPayload {
  return typeof x === "object" && x !== null && (x as { kind?: unknown }).kind === "TEACH";
}

function isDeathWarning(x: unknown): x is DeathWarningPayload {
  return typeof x === "object" && x !== null && (x as { kind?: unknown }).kind === "DEATH_WARNING";
}

// True if we already have a skill that covers the same ground at equal or better quality
function hasBetterSkill(incoming: Skill, skills: SkillSet): boolean {
  const incomingText = `${incoming.effect} ${incoming.description}`.toLowerCase();
  const incomingWords = incomingText.split(/\s+/).filter((w) => w.length > 3);
  if (incomingWords.length === 0) return false;
  for (const s of skills.all()) {
    const existingText = `${s.effect} ${s.description}`.toLowerCase();
    const hits = incomingWords.filter((w) => existingText.includes(w)).length;
    if (hits / incomingWords.length > 0.5 && s.provenance.selfEvalScore >= incoming.provenance.selfEvalScore) {
      return true;
    }
  }
  return false;
}

// Broadcast a newly accepted skill to all peers and emit SKILL_TAUGHT
async function broadcastSkill(deps: DecisionDeps, tick: number, skill: Skill): Promise<void> {
  const { kernel, agentId } = deps;
  await kernel.net.broadcast({ kind: "TEACH", skillId: skill.id, abstract: skill.description } satisfies TeachPayload);
  sendToEngine({
    kind: "EVENT",
    event: {
      type: EventType.SKILL_TAUGHT,
      tick,
      actorId: agentId,
      payload: { skillId: skill.id, to: "*", skill },
    },
  });
}

export async function handleTick(deps: DecisionDeps, tick: number, me: AgentInWorld, nearby: AgentInWorld[]): Promise<void> {
  const { agentId, activityQueue, personality, environment, kernel, skills, cautionList } = deps;

  const current = activityQueue.tick(tick);
  if (current) {
    sendToEngine({ kind: "ACTION", action: current });
    return;
  }

  const needsSummary = `hunger=${me.needs.hunger}/100 energy=${me.needs.energy}/100 curiosity=${me.needs.curiosity}/100 food_stock=${me.food}`;
  const skillList = skills.all().map((s) => `- ${s.name}: ${s.effect} (used ${s.useCount ?? 0}x)`).join("\n") || "(none)";
  const nearbyList = nearby.map((a) => a.id).join(", ") || "nobody";
  const uniqueCautions = [...new Map(cautionList.map((c) => [c.crisisType, c])).values()];
  const cautionContext = uniqueCautions.length > 0
    ? `WARNINGS from community deaths:\n${uniqueCautions.map((c) => {
        const attempt = c.lastAttempt ? ` They tried "${c.lastAttempt.skillName}" (${c.lastAttempt.skillEffect}) — it failed.` : "";
        return `- ${c.crisisType}: ${c.crisisDescription}. Cause of death: ${c.cause}.${attempt}`;
      }).join("\n")}`
    : "";

  const reasonPrompt = [
    `You are ${personality.name}. Traits: ${personality.traits.join(", ")}. Risk tolerance: ${personality.risk}.`,
    personality.promptFragments.reasoning ?? "",
    `Current needs: ${needsSummary}`,
    `Environment: ${environment.physics.join("; ")}`,
    `Resources available: ${environment.resources.join(", ")}`,
    `Known skills:\n${skillList}`,
    `Nearby agents: ${nearbyList}`,
    cautionContext,
    `Tick: ${tick}`,
    `Decide ONE action to address your most pressing need. Reply ONLY with JSON: { "action": "short phrase", "reason": "one sentence" }`,
    `Examples: { "action": "find berries to eat" } or { "action": "rest and recover energy" } or { "action": "experiment with grass bundles" }`,
  ].filter(Boolean).join("\n");

  let intendedAction: string;
  try {
    const resp = await kernel.compute.infer(reasonPrompt, { verifiable: false });
    const json = extractJson(resp.text);
    const parsed = JSON.parse(json) as { action?: unknown };
    const action = typeof parsed.action === "string" ? parsed.action.trim() : "";
    intendedAction = action.length > 0 ? action : me.needs.hunger > 50 ? "find food" : "rest";
  } catch {
    intendedAction = me.needs.hunger > 50 ? "find food" : "rest";
  }

  const matchingSkill = skills.all().find((s) => skillCoversActivity(s, intendedAction));

  if (matchingSkill) {
    const updated = { ...matchingSkill, useCount: (matchingSkill.useCount ?? 0) + 1 };
    skills.add(updated);
    void kernel.storage.putSkill(updated);

    const action = activityFromSkill(matchingSkill);
    activityQueue.start(action, tick, durationForAction(action.kind));
    sendToEngine({ kind: "EVENT", event: { type: EventType.ACTIVITY_STARTED, tick, actorId: agentId, payload: { activity: action.kind, skillId: matchingSkill.id } } });
    sendToEngine({ kind: "ACTION", action });

    // Curiosity-driven growth: re-evolve a well-used skill
    const growthThreshold = 8;
    if (updated.useCount >= growthThreshold && me.needs.curiosity >= 65) {
      void kernel.evolve({
        tick,
        situation: `improve my ${matchingSkill.name} technique after using it ${updated.useCount} times`,
        seedSkill: matchingSkill,
        inventory: me.inventory,
        knownSkills: skills.all(),
      }).then(async (result) => {
        if (!result.accepted) return;
        skills.add(result.skill);
        void kernel.storage.putAgentInventory(agentId, skills.all().map((s) => s.id));
        sendToEngine({ kind: "EVENT", event: { type: EventType.CURIOSITY_EVOLVED, tick, actorId: agentId, payload: { skillId: result.skill.id, inspiredBy: matchingSkill.id, skill: result.skill } } });
        await broadcastSkill(deps, tick, result.skill);
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
  }).then(async (result) => {
    if (!result.accepted) return;
    skills.add(result.skill);
    void kernel.storage.putAgentInventory(agentId, skills.all().map((s) => s.id));
    const action = activityFromSkill(result.skill);
    activityQueue.start(action, tick, durationForAction(action.kind));
    sendToEngine({ kind: "ACTION", action });
    await broadcastSkill(deps, tick, result.skill);
  });
}

export async function handleCrisis(deps: DecisionDeps, tick: number, crisis: Crisis): Promise<void> {
  const { kernel, environment, skills, agentId, activityQueue, cautionList } = deps;

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
      sendToEngine({ kind: "ACTION", action: { kind: "APPLY_SKILL", skillId: skill.id, crisisId: crisis.id } });
      activityQueue.resume(tick);
      return;
    }
  }

  const caution = cautionList.find((c) => c.crisisType.toLowerCase() === crisis.type.toLowerCase());
  const cautionSuffix = caution
    ? ` NOTE: a community member died facing this — they tried "${caution.lastAttempt?.skillName ?? "unknown"}" and it failed. Find a different approach.`
    : "";

  const result = await kernel.evolve({
    tick,
    situation: `${crisis.type} — ${crisis.description}${cautionSuffix}`,
    crisis,
    inventory: [],
    knownSkills: skills.all(),
  });

  if (!result.accepted) {
    activityQueue.resume(tick);
    return;
  }

  skills.add(result.skill);
  await kernel.storage.putAgentInventory(agentId, skills.all().map((s) => s.id));
  await broadcastSkill(deps, tick, result.skill);

  sendToEngine({ kind: "ACTION", action: { kind: "APPLY_SKILL", skillId: result.skill.id, crisisId: crisis.id } });
  activityQueue.resume(tick);
}

export async function handlePeerMessage(
  deps: DecisionDeps,
  tick: number,
  msg: { from: string; payload: unknown },
): Promise<void> {
  const { agentId, personality, kernel, skills } = deps;

  if (isDeathWarning(msg.payload)) {
    const { cause, activeCrises, lastAttempt } = msg.payload;

    for (const crisis of activeCrises) {
      deps.cautionList.push({ crisisType: crisis.type, crisisDescription: crisis.description, cause, lastAttempt, tick });
    }

    sendToEngine({
      kind: "EVENT",
      event: {
        type: EventType.DEATH_WARNING,
        tick,
        actorId: agentId,
        payload: { from: msg.from, cause, activeCrises, lastAttempt },
      },
    });

    // Proactive evolve: if we have no skill for a crisis our community member just died from, start thinking now
    for (const crisis of activeCrises) {
      const hasCrisisSkill = deps.skills.all().some((s) =>
        skillResolvesCrisis(s, crisis as Crisis, deps.environment),
      );
      if (!hasCrisisSkill) {
        const attemptContext = lastAttempt
          ? ` They tried "${lastAttempt.skillName}" (${lastAttempt.skillEffect}) but it wasn't enough.`
          : "";
        void deps.kernel.evolve({
          tick,
          situation: `prepare for ${crisis.type} — a community member just died from it.${attemptContext} Find a better approach.`,
          crisis: crisis as Crisis,
          inventory: [],
          knownSkills: deps.skills.all(),
        }).then(async (result) => {
          if (!result.accepted) return;
          deps.skills.add(result.skill);
          void deps.kernel.storage.putAgentInventory(deps.agentId, deps.skills.all().map((s) => s.id));
          sendToEngine({
            kind: "EVENT",
            event: { type: EventType.SKILL_ACCEPTED, tick, actorId: deps.agentId, payload: { skillId: result.skill.id, skill: result.skill, triggeredBy: "death_warning" } },
          });
          await broadcastSkill(deps, tick, result.skill);
        });
      }
    }
    return;
  }

  if (!isTeachPayload(msg.payload)) return;

  const skillId = msg.payload.skillId;
  if (skills.has(skillId)) return;

  let skill: Skill;
  try {
    skill = await kernel.storage.getSkill(skillId);
  } catch {
    return;
  }

  // Redundancy check — reject if we already have a better equivalent
  if (hasBetterSkill(skill, skills)) {
    sendToEngine({
      kind: "EVENT",
      event: {
        type: EventType.SKILL_REJECTED_BY_PEER,
        tick,
        actorId: agentId,
        payload: { skillId, from: msg.from, reason: "redundant" },
      },
    });
    return;
  }

  // LLM-based acceptance: personality decides whether this skill fits who they are
  const community = await kernel.storage.getAgentSocialGraph(agentId);
  const inCommunity = community.includes(msg.from);
  const acceptPrompt = [
    `You are ${personality.name}. Traits: ${personality.traits.join(", ")}. Risk tolerance: ${personality.risk}.`,
    `${inCommunity ? "A trusted community member" : "A stranger"} is offering to teach you this skill:`,
    `Skill: "${skill.name}" — ${skill.description}`,
    `Effect: ${skill.effect}`,
    `Quality score: ${skill.provenance.selfEvalScore.toFixed(2)}/1.0`,
    `Given your personality and traits, would you adopt this skill? Reply ONLY with JSON: { "accept": boolean, "reason": "one sentence" }`,
  ].join("\n");

  let accepted = false;
  try {
    const resp = await kernel.compute.infer(acceptPrompt, { verifiable: false });
    const json = extractJson(resp.text);
    accepted = (JSON.parse(json) as { accept: boolean }).accept;
  } catch {
    accepted = inCommunity;
  }

  if (!accepted) {
    sendToEngine({
      kind: "EVENT",
      event: {
        type: EventType.SKILL_REJECTED_BY_PEER,
        tick,
        actorId: agentId,
        payload: { skillId, from: msg.from, reason: "personality_mismatch", inCommunity },
      },
    });
    return;
  }

  // Accept
  skills.add(skill);
  await kernel.storage.putAgentInventory(agentId, skills.all().map((s) => s.id));

  // Bond: add sender to our social graph if not already there
  if (!community.includes(msg.from)) {
    const updated = [...community, msg.from];
    await kernel.storage.putAgentSocialGraph(agentId, updated);
    sendToEngine({
      kind: "EVENT",
      event: {
        type: EventType.SOCIAL_GRAPH_UPDATED,
        tick,
        actorId: agentId,
        payload: { newMember: msg.from },
      },
    });
  }

  sendToEngine({
    kind: "EVENT",
    event: {
      type: EventType.SKILL_ACCEPTED_FROM_PEER,
      tick,
      actorId: agentId,
      payload: { skillId, from: msg.from, skill },
    },
  });
  sendToEngine({
    kind: "EVENT",
    event: {
      type: EventType.SKILL_LEARNED,
      tick,
      actorId: agentId,
      payload: { skillId, from: msg.from, skill },
    },
  });

  // Curiosity-driven discovery: curious agents try to improve on what they just learned
  const isCurious = personality.traits.some((t) => t.toLowerCase().includes("curious"));
  if (isCurious) {
    void kernel.evolve({
      tick,
      situation: `explore what's possible beyond ${skill.name}`,
      seedSkill: skill,
      inventory: [],
      knownSkills: skills.all(),
    }).then(async (result) => {
      if (!result.accepted) return;
      skills.add(result.skill);
      void kernel.storage.putAgentInventory(agentId, skills.all().map((s) => s.id));
      sendToEngine({
        kind: "EVENT",
        event: {
          type: EventType.CURIOSITY_EVOLVED,
          tick,
          actorId: agentId,
          payload: { skillId: result.skill.id, inspiredBy: skill.id, skill: result.skill },
        },
      });
      await broadcastSkill(deps, tick, result.skill);
    });
  }
}

export async function inheritOnSpawn(deps: DecisionDeps, tick: number, predecessorIds?: string[]): Promise<void> {
  if (!predecessorIds || predecessorIds.length === 0) return;

  const seen = new Set<string>();
  for (const predecessorId of predecessorIds) {
    const ids = await deps.kernel.storage.getAgentInventory(predecessorId);
    for (const skillId of ids) {
      if (seen.has(skillId)) continue;
      seen.add(skillId);
      if (deps.personality.innateSkills.includes(skillId)) continue;
      if (deps.skills.has(skillId)) continue;
      let skill: Skill;
      try {
        skill = await deps.kernel.storage.getSkill(skillId);
      } catch {
        continue;
      }
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

  if (seen.size > 0) {
    await deps.kernel.storage.putAgentInventory(deps.agentId, deps.skills.all().map((s) => s.id));
  }
}

function activityFromSkill(skill: Skill): AgentAction {
  const text = `${skill.name} ${skill.effect} ${skill.description}`.toLowerCase();
  if (/rest|sleep|recover|energy/.test(text)) return { kind: "REST" };
  if (/forag|berr|gather|hunt|collect/.test(text)) return { kind: "FORAGE" };
  if (/farm|grow|plant|cultivat|grass/.test(text)) return { kind: "FARM" };
  if (/talk|social|communicat|chat/.test(text)) return { kind: "SOCIALIZE", targetId: "" };
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
