import type { Skill, Personality, Environment } from "@moirai/shared";
import { EventType } from "@moirai/shared";
import type {
  IComputeAdapter,
  IStorageAdapter,
  EvolveInput,
  EvolveResult,
  EmitEvent,
} from "@moirai/kernel";
import { EvolveError } from "@moirai/kernel";
import { buildReasonPrompt, buildSelfEvalPrompt } from "./prompts.js";
import { computeSkillId } from "./skill-id.js";
import { parseCandidate, parseEval } from "./parse.js";
import { localPutSkill } from "./localFallback.js";

const BASE_THRESHOLD = 0.6;

function thresholdFor(risk: number): number {
  return BASE_THRESHOLD - (risk - 0.5) * 0.4;
}

export type EvolveDeps = {
  compute: IComputeAdapter;
  storage: IStorageAdapter;
  emit: EmitEvent;
  personality: Personality;
  environment: Environment;
  agentId: string;
};

export async function evolve(deps: EvolveDeps, input: EvolveInput): Promise<EvolveResult> {
  const { compute, storage, emit, personality, environment, agentId } = deps;
  const { tick, situation, crisis, knownSkills, inventory, seedSkill } = input;

  if (!crisis) throw new EvolveError("production kernel-impl requires a crisis in EvolveInput");

  emit({
    type: EventType.REASONING_STARTED,
    payload: { situation, crisisId: crisis.id },
  });

  const reasonPrompt = buildReasonPrompt({
    personality,
    environment,
    situation,
    crisis,
    inventory,
    knownSkillSummaries: knownSkills.map((s) => ({ name: s.name, description: s.description, effect: s.effect })),
  });

  const reasonRes = await compute.infer(reasonPrompt, { verifiable: true });
  if (!reasonRes.receipt.verifiable) {
    process.stderr.write(`[evolve] WARNING: hero-path reasoning fell back to non-verifiable inference\n`);
  }

  let candidate;
  try {
    candidate = parseCandidate(reasonRes.text);
  } catch (err) {
    throw new EvolveError("failed to parse candidate skill from reasoning output", { cause: err });
  }

  emit({
    type: EventType.SKILL_PROPOSED,
    payload: { candidate },
    receiptHash: reasonRes.receipt.hash,
  });

  emit({
    type: EventType.SELF_EVAL_STARTED,
    payload: { candidateName: candidate.name },
  });

  const evalPrompt = buildSelfEvalPrompt({ environment, candidate, situation, crisis, personality, inventory });
  const evalRes = await compute.infer(evalPrompt, { verifiable: true });
  if (!evalRes.receipt.verifiable) {
    process.stderr.write(`[evolve] WARNING: hero-path self-eval fell back to non-verifiable inference\n`);
  }

  let evalResp;
  try {
    evalResp = parseEval(evalRes.text);
  } catch (err) {
    throw new EvolveError("failed to parse self-eval output", { cause: err });
  }

  emit({
    type: EventType.SELF_EVAL_RESULT,
    payload: { score: evalResp.score, failureModes: evalResp.failureModes },
    receiptHash: evalRes.receipt.hash,
  });

  const threshold = thresholdFor(personality.risk);

  if (evalResp.score < threshold) {
    emit({
      type: EventType.SKILL_REJECTED,
      payload: { score: evalResp.score, failureModes: evalResp.failureModes },
      receiptHash: evalRes.receipt.hash,
    });
    return { status: "rejected", score: evalResp.score, failureModes: evalResp.failureModes, candidateName: candidate.name };
  }

  const id = computeSkillId(candidate, agentId, tick);
  const skill: Skill = {
    id,
    name: candidate.name,
    description: candidate.description,
    preconditions: candidate.preconditions,
    effect: candidate.effect,
    steps: candidate.steps,
    provenance: {
      inventedBy: agentId,
      inventedAt: tick,
      bornFrom: crisis
        ? [crisis.id]
        : seedSkill
          ? [`skill:${seedSkill.id}`]
          : [],
      reasonReceipt: reasonRes.receipt.hash,
      selfEvalReceipt: evalRes.receipt.hash,
      selfEvalScore: evalResp.score,
    },
  };

  let storedLocal = false;
  try {
    await storage.putSkill(skill);
  } catch {
    await localPutSkill(skill);
    storedLocal = true;
    process.stderr.write(`[evolve] 0G storage unavailable — skill ${skill.id} written to local fallback\n`);
  }

  emit({
    type: EventType.SKILL_ACCEPTED,
    payload: { skill, score: evalResp.score, ...(storedLocal ? { storedLocal: true } : {}) },
  });

  return { status: "accepted", skill };
}
