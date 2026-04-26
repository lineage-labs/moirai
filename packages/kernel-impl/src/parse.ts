import type { CandidateSkill } from "@moirai/shared";

export type EvalResponse = { score: number; failureModes: string[] };

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced && fenced[1]) return JSON.parse(fenced[1].trim());
  // Fall back to first {...} block in case LLM wraps JSON in prose
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) return JSON.parse(text.slice(start, end + 1));
  return JSON.parse(text.trim());
}

export function parseCandidate(text: string): CandidateSkill {
  const obj = extractJson(text) as Partial<CandidateSkill>;
  if (
    typeof obj.name !== "string" ||
    typeof obj.description !== "string" ||
    typeof obj.effect !== "string" ||
    !Array.isArray(obj.preconditions) ||
    !Array.isArray(obj.steps)
  ) {
    throw new Error("malformed candidate skill JSON");
  }
  return obj as CandidateSkill;
}

export function parseEval(text: string): EvalResponse {
  const obj = extractJson(text) as Partial<EvalResponse>;
  if (typeof obj.score !== "number" || !Array.isArray(obj.failureModes)) {
    throw new Error("malformed self-eval JSON");
  }
  return obj as EvalResponse;
}
