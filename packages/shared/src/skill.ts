export type SkillProvenance = {
  inventedBy: string;
  inventedAt: number;
  bornFrom: string[];
  reasonReceipt: string;
  selfEvalReceipt: string;
  selfEvalScore: number;
};

export type Skill = {
  id: string;
  name: string;
  description: string;
  preconditions: string[];
  effect: string;
  steps: string[];
  provenance: SkillProvenance;
};

export type CandidateSkill = Omit<Skill, "id" | "provenance">;
