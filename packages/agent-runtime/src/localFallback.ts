import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { Skill } from "@moirai/shared";

function base(): string {
  return process.env.MOIRAI_DEV_STORAGE ?? "/tmp/moirai-dev";
}

export async function localGetSkill(id: string): Promise<Skill | null> {
  try {
    const text = await readFile(`${base()}/skills/${id}.json`, "utf8");
    return JSON.parse(text) as Skill;
  } catch {
    return null;
  }
}

export async function localPutInventory(agentId: string, skillIds: string[]): Promise<void> {
  const dir = `${base()}/inventories`;
  await mkdir(dir, { recursive: true }).catch(() => {});
  await writeFile(`${dir}/${agentId}.json`, JSON.stringify(skillIds)).catch(() => {});
}

export async function localGetInventory(agentId: string): Promise<string[]> {
  try {
    const text = await readFile(`${base()}/inventories/${agentId}.json`, "utf8");
    return JSON.parse(text) as string[];
  } catch {
    return [];
  }
}
