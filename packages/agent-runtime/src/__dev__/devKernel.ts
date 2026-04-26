// DEV-ONLY. Replaced by the kernel team's createKernel in production.
// Implements the @moirai/kernel contract just enough to exercise engine + agent-runtime
// without the real 0G Compute / 0G Storage / AXL adapters.

import { createHash } from "node:crypto";
import {
  EventType,
  type SelfEvalResult,
  type Skill,
  type SkillCandidate,
} from "@moirai/shared";
import type {
  EvolveInput,
  EvolveResult,
  Kernel,
  KernelConfig,
  Substrate,
} from "@moirai/kernel";
import { DevComputeAdapter } from "./devCompute.js";
import { DevStorageAdapter } from "./devStorage.js";
import { DevIpcNetworkAdapter } from "./devNetwork.js";

const BASE_THRESHOLD = 0.6;

function acceptanceThreshold(risk: number): number {
  return BASE_THRESHOLD - (risk - 0.5) * 0.4;
}

export async function createKernel(config: KernelConfig): Promise<Kernel> {
  const compute = new DevComputeAdapter();
  const storage = new DevStorageAdapter();
  const net = new DevIpcNetworkAdapter(config.agentId, []);

  const substrate: Substrate = { compute, storage, net };

  return {
    agentId: config.agentId,
    substrate,
    compute,
    storage,
    net,
    async evolve(input: EvolveInput): Promise<EvolveResult> {
      const { tick, crisis, seedSkill, inventory, knownSkills } = input;
      const situation = input.situation ?? (crisis ? `${crisis.type}: ${crisis.description}` : "general survival planning");
      const { personality, environment, emit } = config;

      emit({ type: EventType.REASONING_STARTED, payload: { situation } });

      const reasonPrompt = buildReasonPrompt({
        personality,
        environment,
        situation,
        crisis,
        seedSkill,
        inventory,
        knownSkills,
      });
      const reasonResp = await compute.infer(reasonPrompt, { verifiable: true });
      const candidate = parseCandidate(reasonResp.text);

      emit({
        type: EventType.SKILL_PROPOSED,
        payload: { name: candidate.name, description: candidate.description, effect: candidate.effect },
        receiptHash: reasonResp.receipt.hash,
      });

      emit({ type: EventType.SELF_EVAL_STARTED, payload: { skillName: candidate.name } });

      const evalPrompt = buildEvalPrompt({ environment, candidate });
      const evalResp = await compute.infer(evalPrompt, { verifiable: true });
      const evalResult = parseEval(evalResp.text);

      emit({
        type: EventType.SELF_EVAL_RESULT,
        payload: { score: evalResult.score, failureModes: evalResult.failureModes },
        receiptHash: evalResp.receipt.hash,
      });

      const threshold = acceptanceThreshold(personality.risk);
      if (evalResult.score < threshold) {
        emit({
          type: EventType.SKILL_REJECTED,
          payload: { score: evalResult.score, threshold, failureModes: evalResult.failureModes },
          receiptHash: evalResp.receipt.hash,
        });
        return {
          accepted: false,
          rejection: {
            score: evalResult.score,
            failureModes: evalResult.failureModes,
            reasonReceipt: reasonResp.receipt,
            evalReceipt: evalResp.receipt,
          },
        };
      }

      const skillId = hashSkill(candidate, reasonResp.receipt.hash, evalResp.receipt.hash);
      const skill: Skill = {
        id: skillId,
        ...candidate,
        provenance: {
          inventedBy: config.agentId,
          inventedAt: tick,
          bornFrom: crisis
            ? [`crisis:${crisis.id}`]
            : seedSkill
              ? [`skill:${seedSkill.id}`]
              : [`need:${situation.slice(0, 40)}`],
          reasonReceipt: reasonResp.receipt.hash,
          selfEvalReceipt: evalResp.receipt.hash,
          selfEvalScore: evalResult.score,
        },
      };

      await storage.putSkill(skill);

      emit({
        type: EventType.SKILL_ACCEPTED,
        payload: { skillId: skill.id, name: skill.name, score: evalResult.score, skill },
        receiptHash: evalResp.receipt.hash,
      });

      return { accepted: true, skill, reasonReceipt: reasonResp.receipt, evalReceipt: evalResp.receipt };
    },
    async shutdown() {},
  };
}

function buildReasonPrompt(args: {
  personality: KernelConfig["personality"];
  environment: KernelConfig["environment"];
  situation: EvolveInput["situation"];
  crisis: EvolveInput["crisis"];
  seedSkill: EvolveInput["seedSkill"];
  inventory: EvolveInput["inventory"];
  knownSkills: EvolveInput["knownSkills"];
}): string {
  const { personality, environment, situation, crisis, seedSkill, inventory, knownSkills } = args;
  const known = knownSkills.length === 0 ? "(none)" : knownSkills.map((s) => `- ${s.name}: ${s.effect}`).join("\n");
  const physics = environment.physics.map((p) => `- ${p}`).join("\n");
  return [
    `You are ${personality.name}. Traits: ${personality.traits.join(", ")}.`,
    personality.promptFragments.reasoning ?? "",
    "Physics:",
    physics,
    `Situation: ${situation}`,
    crisis ? `Crisis type: ${crisis.type}` : "",
    seedSkill ? `Existing skill to improve: ${seedSkill.name} — ${seedSkill.effect}` : "",
    `Inventory: ${inventory.join(", ") || "(empty)"}`,
    `Resources: ${environment.resources.join(", ")}`,
    "Known skills:",
    known,
    "Propose ONE new skill that addresses this situation. Reply ONLY with strict JSON.",
  ].join("\n");
}

function buildEvalPrompt(args: {
  environment: KernelConfig["environment"];
  candidate: SkillCandidate;
}): string {
  const { environment, candidate } = args;
  return [
    "Score the proposal against world physics.",
    `Physics: ${environment.physics.join("; ")}`,
    `Proposed skill: ${candidate.name} — ${candidate.description}`,
    `Effect: ${candidate.effect}`,
    `Steps: ${candidate.steps.join(" -> ")}`,
    "Reply with strict JSON: {\"score\": number, \"failureModes\": string[]}",
  ].join("\n");
}

function parseCandidate(text: string): SkillCandidate {
  const json = extractJson(text);
  const c = JSON.parse(json);
  return {
    name: String(c.name),
    description: String(c.description),
    preconditions: Array.isArray(c.preconditions) ? c.preconditions.map(String) : [],
    effect: String(c.effect),
    steps: Array.isArray(c.steps) ? c.steps.map(String) : [],
  };
}

function parseEval(text: string): SelfEvalResult {
  const json = extractJson(text);
  const r = JSON.parse(json);
  return {
    score: typeof r.score === "number" ? Math.max(0, Math.min(1, r.score)) : 0,
    failureModes: Array.isArray(r.failureModes) ? r.failureModes.map(String) : [],
  };
}

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0 || end < start) throw new Error("no JSON in dev compute output");
  return text.slice(start, end + 1);
}

function hashSkill(c: SkillCandidate, ra: string, rb: string): string {
  const canonical = JSON.stringify({
    name: c.name,
    description: c.description,
    preconditions: [...c.preconditions].sort(),
    effect: c.effect,
    steps: c.steps,
    fp: `${ra}:${rb}`,
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}
