import type { Skill, Event } from "@moirai/shared";
import type { IStorageAdapter } from "@moirai/kernel";

export type ZeroGStorageConfig = {
  endpoint: string;
  apiKey?: string;
  namespace?: string;
  maxRetries?: number;
  initialBackoffMs?: number;
};

async function withRetries<T>(fn: () => Promise<T>, attempts: number, initialMs: number): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1) break;
      const delay = initialMs * Math.pow(2, i);
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  throw lastErr;
}

export class ZeroGStorageAdapter implements IStorageAdapter {
  private readonly maxRetries: number;
  private readonly initialBackoffMs: number;

  constructor(private readonly cfg: ZeroGStorageConfig) {
    this.maxRetries = cfg.maxRetries ?? 3;
    this.initialBackoffMs = cfg.initialBackoffMs ?? 200;
  }

  async putSkill(skill: Skill): Promise<{ id: string }> {
    return withRetries(() => this.putSkillOnce(skill), this.maxRetries, this.initialBackoffMs);
  }

  async getSkill(_id: string): Promise<Skill | null> {
    throw new Error(
      `ZeroGStorageAdapter.getSkill not wired. Wire 0G Storage indexer SDK after spike. endpoint=${this.cfg.endpoint}`,
    );
  }

  async listSkills(): Promise<Skill[]> {
    throw new Error(
      `ZeroGStorageAdapter.listSkills not wired. endpoint=${this.cfg.endpoint}`,
    );
  }

  async appendEvent(_event: Event): Promise<void> {
    throw new Error(
      `ZeroGStorageAdapter.appendEvent not wired. endpoint=${this.cfg.endpoint}`,
    );
  }

  private async putSkillOnce(_skill: Skill): Promise<{ id: string }> {
    throw new Error(
      `ZeroGStorageAdapter.putSkill not wired. Wire 0G Storage indexer SDK after spike. endpoint=${this.cfg.endpoint}`,
    );
  }
}
