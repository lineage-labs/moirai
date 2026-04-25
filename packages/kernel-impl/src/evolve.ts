import type { Skill, Event } from "@moirai/shared";
import type {
  IComputeAdapter,
  IStorageAdapter,
  EvolveInput,
  EvolveResult,
} from "@moirai/kernel";
import { EvolveError } from "@moirai/kernel";
import { buildReasonPrompt, buildSelfEvalPrompt } from "./prompts.js";
import { computeSkillId } from "./skill-id.js";
import { parseCandidate, parseEval } from "./parse.js";

const BASE_THRESHOLD = 0.6;

function thresholdFor(risk: number): number {
  return BASE_THRESHOLD - (risk - 0.5) * 0.4;
}

export type EvolveDeps = {
  compute: IComputeAdapter;
  storage: IStorageAdapter;
  emit: (event: Event) => void;
};

export async function evolve(deps: EvolveDeps, input: EvolveInput): Promise<EvolveResult> {
  const { compute, storage, emit } = deps;
  const { personality, environment, crisis, context, knownSkills } = input;

  emit({
    kind: "REASONING_STARTED",
    tick: context.tick,
    actorId: context.agentId,
    payload: { crisisId: crisis.id },
  });

  const reasonPrompt = buildReasonPrompt({
    personality,
    environment,
    crisis,
    context,
    knownSkillSummaries: knownSkills.map((s) => ({ name: s.name, description: s.description, effect: s.effect })),
  });

  const reasonRes = await compute.infer(reasonPrompt, { verifiable: true });
  if (!reasonRes.receipt.verifiable) {
    throw new EvolveError("hero-path reasoning fell back to non-verifiable inference");
  }

  let candidate;
  try {
    candidate = parseCandidate(reasonRes.text);
  } catch (err) {
    throw new EvolveError("failed to parse candidate skill from reasoning output", { cause: err });
  }

  emit({
    kind: "SKILL_PROPOSED",
    tick: context.tick,
    actorId: context.agentId,
    payload: { candidate },
    receiptHash: reasonRes.receipt.hash,
  });

  emit({
    kind: "SELF_EVAL_STARTED",
    tick: context.tick,
    actorId: context.agentId,
    payload: { candidateName: candidate.name },
  });

  const evalPrompt = buildSelfEvalPrompt({ environment, candidate, crisis, personality });
  const evalRes = await compute.infer(evalPrompt, { verifiable: true });
  if (!evalRes.receipt.verifiable) {
    throw new EvolveError("hero-path self-eval fell back to non-verifiable inference");
  }

  let evalResp;
  try {
    evalResp = parseEval(evalRes.text);
  } catch (err) {
    throw new EvolveError("failed to parse self-eval output", { cause: err });
  }

  emit({
    kind: "SELF_EVAL_RESULT",
    tick: context.tick,
    actorId: context.agentId,
    payload: { score: evalResp.score, failureModes: evalResp.failureModes },
    receiptHash: evalRes.receipt.hash,
  });

  const threshold = thresholdFor(personality.risk);

  if (evalResp.score < threshold) {
    const reason = `score ${evalResp.score} < threshold ${threshold}`;
    emit({
      kind: "SKILL_REJECTED",
      tick: context.tick,
      actorId: context.agentId,
      payload: { reason, score: evalResp.score },
      receiptHash: evalRes.receipt.hash,
    });
    return { status: "rejected", reason, score: evalResp.score };
  }

  const id = computeSkillId(candidate, context.agentId, context.tick);
  const skill: Skill = {
    id,
    name: candidate.name,
    description: candidate.description,
    preconditions: candidate.preconditions,
    effect: candidate.effect,
    steps: candidate.steps,
    provenance: {
      inventedBy: context.agentId,
      inventedAt: context.tick,
      bornFrom: [crisis.id],
      reasonReceipt: reasonRes.receipt.hash,
      selfEvalReceipt: evalRes.receipt.hash,
      selfEvalScore: evalResp.score,
    },
  };

  await storage.putSkill(skill);

  emit({
    kind: "SKILL_ACCEPTED",
    tick: context.tick,
    actorId: context.agentId,
    payload: { skill },
  });

  return { status: "accepted", skill };
}
