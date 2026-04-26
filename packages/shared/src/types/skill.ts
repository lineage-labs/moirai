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
  useCount?: number;
};

export type SkillCandidate = Omit<Skill, "id" | "provenance">;

export type SelfEvalResult = {
  score: number;
  failureModes: string[];
};

export type ComputeReceipt = {
  hash: string;
  provider: string;
  model: string;
  signedAt: number;
  verifiable: boolean;
};
