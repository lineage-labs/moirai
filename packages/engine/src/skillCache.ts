import type { Skill } from "@moirai/shared";

/**
 * The engine doesn't fetch skills from 0G itself (no sponsor SDK in engine).
 * Agents register skills they've accepted/learned/inherited via event payloads,
 * and the engine caches the bodies here so it can adjudicate APPLY_SKILL actions.
 */
export class SkillCache {
  private byId = new Map<string, Skill>();

  register(skill: Skill): void {
    this.byId.set(skill.id, skill);
  }

  get(id: string): Skill | undefined {
    return this.byId.get(id);
  }

  size(): number {
    return this.byId.size;
  }
}
