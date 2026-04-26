// DEV-ONLY. Replaced by kernel team's 0g-storage adapter in production.
// File-based shared storage so multiple forked agents see each other's writes.

import { mkdir, readFile, rename, rmdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { DomainEvent, Skill } from "@moirai/shared";
import type { IStorageAdapter } from "@moirai/kernel";

const SHARED_DIR = process.env.MOIRAI_DEV_STORAGE ?? join(tmpdir(), "moirai-dev");
const SKILLS_FILE = join(SHARED_DIR, "skills.json");
const EVENTS_FILE = join(SHARED_DIR, "events.json");
const INVENTORIES_FILE = join(SHARED_DIR, "inventories.json");
const SOCIAL_GRAPH_FILE = join(SHARED_DIR, "socialGraph.json");

async function readArray<T>(path: string): Promise<T[]> {
  try {
    const raw = await readFile(path, "utf8");
    if (!raw.trim()) return [];
    return JSON.parse(raw) as T[];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

async function writeArrayAtomic<T>(path: string, items: T[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}.${randomUUID()}`;
  await writeFile(tmp, JSON.stringify(items, null, 2));
  await rename(tmp, path);
}

async function readObject<T extends Record<string, unknown>>(path: string): Promise<T> {
  try {
    const raw = await readFile(path, "utf8");
    if (!raw.trim()) return {} as T;
    return JSON.parse(raw) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {} as T;
    throw e;
  }
}

async function writeObjectAtomic<T>(path: string, obj: T): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}.${randomUUID()}`;
  await writeFile(tmp, JSON.stringify(obj, null, 2));
  await rename(tmp, path);
}

async function withLock<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
  const lock = `${lockPath}.lock`;
  await mkdir(dirname(lockPath), { recursive: true });
  const start = Date.now();
  while (true) {
    try {
      await mkdir(lock);
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      if (Date.now() - start > 5000) throw new Error(`timed out acquiring lock ${lock}`);
      await new Promise((r) => setTimeout(r, 5 + Math.random() * 15));
    }
  }
  try {
    return await fn();
  } finally {
    try {
      await rmdir(lock);
    } catch {
      /* ignore */
    }
  }
}

export class DevStorageAdapter implements IStorageAdapter {
  async putSkill(skill: Skill): Promise<{ rootHash: string }> {
    await mkdir(SHARED_DIR, { recursive: true });
    await withLock(SKILLS_FILE, async () => {
      const skills = await readArray<Skill>(SKILLS_FILE);
      if (!skills.find((s) => s.id === skill.id)) {
        skills.push(skill);
        await writeArrayAtomic(SKILLS_FILE, skills);
      }
    });
    return { rootHash: skill.id };
  }

  async getSkill(rootHash: string): Promise<Skill> {
    const skills = await withLock(SKILLS_FILE, () => readArray<Skill>(SKILLS_FILE));
    const found = skills.find((s) => s.id === rootHash);
    if (!found) throw new Error(`skill ${rootHash} not found`);
    return found;
  }

  async listSkills(filter?: { minScore?: number }): Promise<Skill[]> {
    const skills = await withLock(SKILLS_FILE, () => readArray<Skill>(SKILLS_FILE));
    if (filter?.minScore === undefined) return skills;
    return skills.filter((s) => s.provenance.selfEvalScore >= filter.minScore!);
  }

  async putAgentInventory(agentId: string, skillIds: string[]): Promise<void> {
    await withLock(INVENTORIES_FILE, async () => {
      const map = await readObject<Record<string, string[]>>(INVENTORIES_FILE);
      map[agentId] = skillIds;
      await writeObjectAtomic(INVENTORIES_FILE, map);
    });
  }

  async getAgentInventory(agentId: string): Promise<string[]> {
    const map = await withLock(INVENTORIES_FILE, () => readObject<Record<string, string[]>>(INVENTORIES_FILE));
    return map[agentId] ?? [];
  }

  async putAgentSocialGraph(agentId: string, memberIds: string[]): Promise<void> {
    await withLock(SOCIAL_GRAPH_FILE, async () => {
      const map = await readObject<Record<string, string[]>>(SOCIAL_GRAPH_FILE);
      map[agentId] = [...new Set(memberIds)];
      await writeObjectAtomic(SOCIAL_GRAPH_FILE, map);
    });
  }

  async getAgentSocialGraph(agentId: string): Promise<string[]> {
    const map = await withLock(SOCIAL_GRAPH_FILE, () => readObject<Record<string, string[]>>(SOCIAL_GRAPH_FILE));
    return map[agentId] ?? [];
  }

  async appendEvent(event: DomainEvent): Promise<{ eventId: string }> {
    await mkdir(SHARED_DIR, { recursive: true });
    let eventId = "";
    await withLock(EVENTS_FILE, async () => {
      const events = await readArray<DomainEvent & { eventId: string }>(EVENTS_FILE);
      eventId = `evt_${events.length}_${Date.now()}`;
      events.push({ ...event, eventId });
      await writeArrayAtomic(EVENTS_FILE, events);
    });
    return { eventId };
  }
}

export async function clearDevStorage(): Promise<void> {
  await mkdir(SHARED_DIR, { recursive: true });
  await writeArrayAtomic(SKILLS_FILE, []);
  await writeArrayAtomic(EVENTS_FILE, []);
  await writeObjectAtomic(INVENTORIES_FILE, {});
  await writeObjectAtomic(SOCIAL_GRAPH_FILE, {});
}
