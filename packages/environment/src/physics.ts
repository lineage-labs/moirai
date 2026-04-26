import type { Crisis, Environment, Skill } from "@moirai/shared";

/**
 * Does this skill resolve this crisis under the world's physics?
 *
 * v1: keyword overlap between the skill's effect/steps and the crisis,
 * augmented by the environment's stated physics. Deterministic and fast.
 * v2: replace with LLM adjudication if needed.
 */
export function skillResolvesCrisis(skill: Skill, crisis: Crisis, environment: Environment): boolean {
  const haystack = `${skill.effect} ${skill.description} ${skill.steps.join(" ")}`.toLowerCase();
  const crisisType = crisis.type.toLowerCase();
  const crisisDesc = crisis.description.toLowerCase();

  if (haystack.includes(crisisType)) return true;

  const tokens = crisisDesc.split(/\s+/).filter((t) => t.length > 3);
  let hits = 0;
  for (const tok of tokens) if (haystack.includes(tok)) hits++;
  if (hits >= 2) return true;

  const physics = environment.physics.join(" ").toLowerCase();
  for (const tok of tokens) {
    if (physics.includes(tok)) {
      for (const word of haystack.split(/\s+/)) {
        if (word.length > 3 && physics.includes(word)) return true;
      }
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
