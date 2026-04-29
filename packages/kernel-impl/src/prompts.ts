import type { Crisis, Personality, Environment, AgentContext, CandidateSkill, Skill } from "@moirai/shared";

export type SkillAdoptionEvalInput = {
  environment: Pick<Environment, "physics">;
  skill: Pick<Skill, "name" | "description" | "effect" | "steps">;
  personality: Personality;
  inventory?: string[];
};

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
    `Your personal inventory (what you currently carry): ${input.context.inventory.join(", ") || "(empty)"}.`,
    `Crisis: ${input.crisis.description} (deadline in ${input.crisis.deadlineTicks} ticks).`,
    input.knownSkillSummaries.length
      ? `Known skills:\n${input.knownSkillSummaries.map((s) => `- ${s.name}: ${s.effect}`).join("\n")}`
      : `Known skills: none.`,
    `Propose ONE new skill to resolve the crisis using ONLY items in your personal inventory. Respond as JSON matching: { name, description, preconditions: string[], effect, steps: string[] }.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export type SelfEvalPromptInput = {
  environment: Pick<Environment, "physics">;
  candidate: CandidateSkill;
  crisis: Crisis;
  personality?: Personality;
  inventory?: string[];
};

export function buildSkillAdoptionEvalPrompt(input: SkillAdoptionEvalInput): string {
  const fragment = input.personality.promptFragments.selfEval?.trim() ?? "";
  const inv = input.inventory?.length ? input.inventory.join(", ") : "(empty)";
  return [
    `You are ${input.personality.name}. Traits: ${input.personality.traits.join(", ")}.`,
    fragment,
    `World physics: ${input.environment.physics.join("; ")}.`,
    `Your current inventory: ${inv}.`,
    `A peer agent has offered to teach you the following skill:`,
    `name: ${input.skill.name}\ndescription: ${input.skill.description}\neffect: ${input.skill.effect}\nsteps:\n- ${input.skill.steps.join("\n- ")}`,
    `Evaluate whether this skill is worth learning given your personality and the world you live in. Respond as JSON: { score: number (0..1), failureModes: string[] }. Score 1 means you would definitely adopt it, 0 means you would never use it.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildSelfEvalPrompt(input: SelfEvalPromptInput): string {
  const fragment = input.personality?.promptFragments.selfEval?.trim() ?? "";
  const inv = input.inventory?.length ? input.inventory.join(", ") : "(empty)";
  const persona = input.personality
    ? `You are ${input.personality.name}. Traits: ${input.personality.traits.join(", ")}.`
    : null;
  return [
    persona,
    fragment,
    `Crisis: ${input.crisis.description}. You are carrying: ${inv}.`,
    `Execute the following skill step by step in your mind, as yourself:\nname: ${input.candidate.name}\n- ${input.candidate.steps.join("\n- ")}`,
    `For each step, determine what happens when you try it. Note where execution breaks down. Does completing all steps resolve the crisis? Score your confidence 0..1 through your own personality lens. Respond as JSON: { score: number (0..1), failureModes: string[] }. A score towards 0 indicates the skill won't help, a sco
    -re towards 1 indicates the skill is helpful`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
