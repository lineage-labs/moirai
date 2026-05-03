import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Environment, Skill, Crisis } from "@moirai/shared";

const __dir = dirname(fileURLToPath(import.meta.url));

export function loadEnvironment(id = "savannah"): Environment {
  const raw = readFileSync(join(__dir, "worlds", `${id}.json`), "utf8");
  return JSON.parse(raw) as Environment;
}

const LION_KEYWORDS = ["throw", "scare", "repel", "sharp", "point", "spear", "rock", "stone", "fire", "shout", "noise", "club", "stab", "ward", "deter", "lion"];
const HUNGER_KEYWORDS = ["food", "eat", "berr", "fruit", "gather", "forage", "nourish", "cook", "root", "plant", "edible", "harvest", "feed", "nutrition", "sustain", "meal"];

export function skillResolvesCrisis(skill: Skill, crisis: Crisis, _env: Environment): boolean {
  const effect = skill.effect.toLowerCase();
  const name = skill.name.toLowerCase();
  const combined = `${effect} ${name}`;
  const type = crisis.type.toLowerCase();

  if (type === "lion") {
    return LION_KEYWORDS.some((kw) => combined.includes(kw));
  }
  if (type === "hunger") {
    const hasHungerWord = HUNGER_KEYWORDS.some((kw) => combined.includes(kw));
    // Reject skills whose primary purpose is lion-deterrence even if they mention food tangentially
    const isPrimarilyLionSkill = combined.includes("lion") || combined.includes("deter") || combined.includes("scare") || combined.includes("sling") || combined.includes("weapon");
    return hasHungerWord && !isPrimarilyLionSkill;
  }
  return false;
}
