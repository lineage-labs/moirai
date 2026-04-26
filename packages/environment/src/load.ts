import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Environment } from "@moirai/shared";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORLDS_DIR = resolve(HERE, "..", "worlds");

export async function loadEnvironment(path: string): Promise<Environment> {
  const raw = await readFile(path, "utf8");
  const obj = JSON.parse(raw) as Environment;
  validate(obj, path);
  return obj;
}

export async function loadSeedEnvironment(id: string): Promise<Environment> {
  return loadEnvironment(seedEnvironmentPath(id));
}

export function seedEnvironmentPath(id: string): string {
  return join(WORLDS_DIR, `${id}.json`);
}

function validate(e: Environment, source: string): void {
  if (!e.id) throw new Error(`environment at ${source}: missing id`);
  if (!Array.isArray(e.physics)) throw new Error(`environment ${e.id}: physics must be array`);
  if (!Array.isArray(e.resources)) throw new Error(`environment ${e.id}: resources must be array`);
  if (!["open", "ring", "hub"].includes(e.topology)) {
    throw new Error(`environment ${e.id}: topology must be open|ring|hub`);
  }
  if (!Array.isArray(e.crisisSchedule)) throw new Error(`environment ${e.id}: crisisSchedule must be array`);
}
