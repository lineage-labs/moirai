import type { Crisis, Personality, Environment, CandidateSkill, Skill } from "@moirai/shared";

export type ReasonPromptInput = {
  personality: Personality;
  environment: Pick<Environment, "physics" | "resources">;
  situation: string;
  crisis?: Crisis;
  inventory: string[];
  knownSkillSummaries: Array<Pick<Skill, "name" | "description" | "effect">>;
};

export function buildReasonPrompt(input: ReasonPromptInput): string {
  const fragment = input.personality.promptFragments.reasoning?.trim() ?? "";
  return [
    `You are ${input.personality.name}. Traits: ${input.personality.traits.join(", ")}.`,
    fragment,
    `World physics: ${input.environment.physics.join("; ")}.`,
    `Available resources: ${input.environment.resources.join(", ")}.`,
    `Inventory: ${input.inventory.join(", ") || "(empty)"}.`,
    `Situation: ${input.situation}`,
    input.crisis ? `Crisis deadline: ${input.crisis.deadlineTicks} ticks remaining.` : "",
    input.knownSkillSummaries.length
      ? `Known skills:\n${input.knownSkillSummaries.map((s) => `- ${s.name}: ${s.effect}`).join("\n")}`
      : `Known skills: none.`,
    `Propose ONE new skill to handle this situation using available resources. Respond as JSON: { name, description, preconditions: string[], effect, steps: string[] }.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export type SelfEvalPromptInput = {
  environment: Pick<Environment, "physics">;
  candidate: CandidateSkill;
  situation: string;
  crisis?: Crisis;
  personality?: Personality;
};

export function buildSelfEvalPrompt(input: SelfEvalPromptInput): string {
  const fragment = input.personality?.promptFragments.selfEval?.trim() ?? "";
  return [
    `Evaluate the proposed skill against world physics and the situation.`,
    fragment,
    `World physics: ${input.environment.physics.join("; ")}.`,
    `Situation: ${input.situation}`,
    input.crisis ? `Crisis: ${input.crisis.description}.` : "",
    `Proposed skill:\nname: ${input.candidate.name}\ndescription: ${input.candidate.description}\neffect: ${input.candidate.effect}\nsteps:\n- ${input.candidate.steps.join("\n- ")}`,
    `Respond as JSON: { score: number (0..1), failureModes: string[] }.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
