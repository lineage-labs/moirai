import type { Skill } from "@moirai/shared";

export class SkillSet {
  private byId = new Map<string, Skill>();

  add(skill: Skill): void {
    this.byId.set(skill.id, skill);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  get(id: string): Skill | undefined {
    return this.byId.get(id);
  }

  all(): Skill[] {
    return [...this.byId.values()];
  }

  size(): number {
    return this.byId.size;
  }
}
