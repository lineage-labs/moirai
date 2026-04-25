import { createHash } from "node:crypto";
import type { CandidateSkill } from "@moirai/shared";

export function computeSkillId(candidate: CandidateSkill, inventedBy: string, inventedAt: number): string {
  const payload = JSON.stringify({
    name: candidate.name,
    description: candidate.description,
    preconditions: candidate.preconditions,
    effect: candidate.effect,
    steps: candidate.steps,
    inventedBy,
    inventedAt,
  });
  return "skill_" + createHash("sha256").update(payload).digest("hex").slice(0, 16);
}
