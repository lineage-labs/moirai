import type { Skill, Event } from "@moirai/shared";
import type {
  IComputeAdapter,
  IStorageAdapter,
  EvolveInput,
  EvolveResult,
  AdoptInput,
  AdoptResult,
} from "@moirai/kernel";
import { EvolveError } from "@moirai/kernel";
import { buildReasonPrompt, buildSelfEvalPrompt, buildSkillAdoptionEvalPrompt } from "./prompts.js";
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

export async function evaluateAdoption(
  deps: Pick<EvolveDeps, "compute">,
  input: AdoptInput,
): Promise<AdoptResult> {
  const { personality, skill, environment, inventory } = input;
  const threshold = thresholdFor(personality.risk);

  const prompt = buildSkillAdoptionEvalPrompt({ environment, skill, personality, inventory });
  const res = await deps.compute.infer(prompt, { verifiable: false });
  const evalResp = parseEval(res.text);

  const adopt = evalResp.score >= threshold;
  const label = adopt ? "ADOPT" : `DECLINE${evalResp.failureModes.length ? ` (${evalResp.failureModes.slice(0, 2).join("; ")})` : ""}`;
  console.error(
    `[evaluateAdoption:${personality.id}] skill="${skill.name}" score=${evalResp.score.toFixed(3)} threshold=${threshold.toFixed(3)} → ${label}`,
  );
  if (adopt) return { adopt: true, score: evalResp.score };
  return { adopt: false, score: evalResp.score, failureModes: evalResp.failureModes };
}

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
  console.error(`[evolve:${context.agentId}] proposed: "${candidate.name}" | effect: ${candidate.effect} | steps: ${candidate.steps.length}`);

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

  const evalPrompt = buildSelfEvalPrompt({ environment, candidate, crisis, personality, inventory: context.inventory });
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
  console.error(`[evolve:${context.agentId}] self-eval score=${evalResp.score.toFixed(3)} threshold=${threshold.toFixed(3)} → ${evalResp.score >= threshold ? "ACCEPT" : "REJECT"}`);
  if (evalResp.failureModes.length) {
    console.error(`[evolve:${context.agentId}] failure modes: ${evalResp.failureModes.join("; ")}`);
  }

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

  console.error(`[evolve:${context.agentId}] writing skill "${skill.name}" (${skill.id}) to 0G Storage`);
  await storage.putSkill(skill);
  console.error(`[evolve:${context.agentId}] skill stored ✓ id=${skill.id}`);

  emit({
    kind: "SKILL_ACCEPTED",
    tick: context.tick,
    actorId: context.agentId,
    payload: { skill },
  });

  return { status: "accepted", skill };
}
