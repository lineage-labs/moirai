import type { Crisis, Personality, Environment, AgentContext, CandidateSkill, Skill } from "@moirai/shared";

export type ReasonPromptInput = {
  personality: Personality;
  environment: Pick<Environment, "physics" | "resources">;
  crisis: Crisis;
  context: AgentContext;
  knownSkillSummaries: Array<Pick<Skill, "name" | "description" | "effect">>;
};

export function buildReasonPrompt(input: ReasonPromptInput): string {
  const fragment = input.personality.promptFragments.reasoning?.trim() ?? "";
  return [
    `You are ${input.personality.name}. Traits: ${input.personality.traits.join(", ")}.`,
    fragment,
    `World physics: ${input.environment.physics.join("; ")}.`,
    `Available resources: ${input.environment.resources.join(", ")}.`,
    `Inventory: ${input.context.inventory.join(", ") || "(empty)"}.`,
    `Crisis: ${input.crisis.description} (deadline in ${input.crisis.deadlineTicks} ticks).`,
    input.knownSkillSummaries.length
      ? `Known skills:\n${input.knownSkillSummaries.map((s) => `- ${s.name}: ${s.effect}`).join("\n")}`
      : `Known skills: none.`,
    `Propose ONE new skill that could resolve the crisis using available resources. Respond as JSON matching: { name, description, preconditions: string[], effect, steps: string[] }.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export type SelfEvalPromptInput = {
  environment: Pick<Environment, "physics">;
  candidate: CandidateSkill;
  crisis: Crisis;
  personality?: Personality;
};

export function buildSelfEvalPrompt(input: SelfEvalPromptInput): string {
  const fragment = input.personality?.promptFragments.selfEval?.trim() ?? "";
  return [
    `Evaluate the proposed skill against world physics and the crisis.`,
    fragment,
    `World physics: ${input.environment.physics.join("; ")}.`,
    `Crisis: ${input.crisis.description}.`,
    `Proposed skill:\nname: ${input.candidate.name}\ndescription: ${input.candidate.description}\neffect: ${input.candidate.effect}\nsteps:\n- ${input.candidate.steps.join("\n- ")}`,
    `Respond as JSON matching: { score: number (0..1), failureModes: string[] }.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
