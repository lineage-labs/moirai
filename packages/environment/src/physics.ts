import type { Crisis, Environment, Skill } from "@moirai/shared";

/**
 * Does this skill resolve this crisis under the world's physics?
 *
 * v1: keyword overlap between the skill's effect/steps and the crisis,
 * augmented by the environment's stated physics. Deterministic and fast.
 * v2: replace with LLM adjudication if needed.
 */
export function skillResolvesCrisis(skill: Skill, crisis: Crisis, environment: Environment): boolean {
  const haystack = [
    skill.name,
    skill.effect,
    skill.description,
    ...(skill.preconditions ?? []),
    ...skill.steps,
  ].join(" ").toLowerCase();

  const crisisType = crisis.type.toLowerCase();
  const crisisDesc = crisis.description.toLowerCase();

  // Direct: skill name/description explicitly references the crisis type
  if (haystack.includes(crisisType)) return true;

  // Token overlap: any significant word from crisis description appears in skill
  const descTokens = crisisDesc.split(/\s+/).filter((t) => t.length > 3);
  for (const tok of descTokens) {
    if (haystack.includes(tok)) return true;
  }

  // Physics bridge: find rules that mention the crisis type, then check if the
  // skill invokes any keyword those rules prescribe (e.g. "lions fear pointy things"
  // → a skill mentioning "pointy" or "sharp" resolves a LION crisis)
  const relevantRules = environment.physics.filter((rule) =>
    rule.toLowerCase().includes(crisisType),
  );
  for (const rule of relevantRules) {
    const ruleTokens = rule.toLowerCase().split(/\s+/).filter(
      (t) => t.length > 3 && !t.includes(crisisType),
    );
    for (const tok of ruleTokens) {
      if (haystack.includes(tok)) return true;
    }
  }

  return false;
}

/**
 * Does this skill cover the agent's intended action?
 * Used for routine activity matching (not crisis resolution).
 */
export function skillCoversActivity(skill: Skill, intendedAction: string): boolean {
  const haystack = `${skill.name} ${skill.effect} ${skill.description} ${skill.steps.join(" ")}`.toLowerCase();
  const tokens = intendedAction.toLowerCase().split(/\s+/).filter(t => t.length > 3);
  let hits = 0;
  for (const tok of tokens) if (haystack.includes(tok)) hits++;
  return hits >= 1;
}
