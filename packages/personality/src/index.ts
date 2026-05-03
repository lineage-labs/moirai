import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Personality } from "@moirai/shared";

const __dir = dirname(fileURLToPath(import.meta.url));

const PERSONALITY_IDS = ["alice", "bob", "charlie", "dave", "eve"] as const;
export type PersonalityId = (typeof PERSONALITY_IDS)[number];

export function loadPersonality(id: string): Personality {
  const raw = readFileSync(join(__dir, "personalities", `${id}.json`), "utf8");
  return JSON.parse(raw) as Personality;
}

export function allPersonalityIds(): string[] {
  return [...PERSONALITY_IDS];
}
