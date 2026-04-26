import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Personality } from "@moirai/shared";

export type { Personality } from "@moirai/shared";

const HERE = dirname(fileURLToPath(import.meta.url));
const SEEDS_DIR = resolve(HERE, "..", "personalities");

export async function loadPersonality(path: string): Promise<Personality> {
  const raw = await readFile(path, "utf8");
  const obj = JSON.parse(raw) as Personality;
  validate(obj, path);
  return obj;
}

export async function loadSeedPersonality(id: string): Promise<Personality> {
  return loadPersonality(seedPersonalityPath(id));
}

export async function listSeedPersonalityIds(): Promise<string[]> {
  const files = await readdir(SEEDS_DIR);
  return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
}

export function seedPersonalityPath(id: string): string {
  return join(SEEDS_DIR, `${id}.json`);
}

function validate(p: Personality, source: string): void {
  if (!p.id || typeof p.id !== "string") throw new Error(`personality at ${source}: missing id`);
  if (!p.name) throw new Error(`personality ${p.id}: missing name`);
  if (typeof p.risk !== "number" || p.risk < 0 || p.risk > 1) {
    throw new Error(`personality ${p.id}: risk must be 0..1`);
  }
  if (!Array.isArray(p.traits)) throw new Error(`personality ${p.id}: traits must be array`);
  if (!Array.isArray(p.innateSkills)) throw new Error(`personality ${p.id}: innateSkills must be array`);
  if (!p.promptFragments || typeof p.promptFragments !== "object") {
    throw new Error(`personality ${p.id}: promptFragments must be object`);
  }
}
