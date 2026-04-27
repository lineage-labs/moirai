import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { Skill } from "@moirai/shared";

function skillsDir(): string {
  return `${process.env.MOIRAI_DEV_STORAGE ?? "/tmp/moirai-dev"}/skills`;
}

export async function localPutSkill(skill: Skill): Promise<void> {
  const dir = skillsDir();
  await mkdir(dir, { recursive: true }).catch(() => {});
  await writeFile(`${dir}/${skill.id}.json`, JSON.stringify(skill)).catch(() => {});
}

export async function localGetSkill(id: string): Promise<Skill | null> {
  try {
    const text = await readFile(`${skillsDir()}/${id}.json`, "utf8");
    return JSON.parse(text) as Skill;
  } catch {
    return null;
  }
}
