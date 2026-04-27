import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
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

export async function localListSkills(): Promise<Skill[]> {
  try {
    const dir = `${base()}/skills`;
    const files = await readdir(dir);
    const results = await Promise.all(
      files.filter((f) => f.endsWith(".json")).map((f) => localGetSkill(f.slice(0, -5))),
    );
    return results.filter((s): s is Skill => s !== null);
  } catch {
    return [];
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

export async function localPutCautions(agentId: string, cautions: Record<string, string>): Promise<void> {
  const dir = `${base()}/cautions`;
  await mkdir(dir, { recursive: true }).catch(() => {});
  await writeFile(`${dir}/${agentId}.json`, JSON.stringify(cautions)).catch(() => {});
}

export async function localGetCautions(agentId: string): Promise<Record<string, string>> {
  try {
    const text = await readFile(`${base()}/cautions/${agentId}.json`, "utf8");
    return JSON.parse(text) as Record<string, string>;
  } catch {
    return {};
  }
}
