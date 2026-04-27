import { ethers } from "ethers";
import { Indexer, MemData } from "@0glabs/0g-ts-sdk";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Skill } from "@moirai/shared";
import type { IStorageAdapter } from "@moirai/kernel";

export type ZeroGStorageConfig = {
  indexerUrl: string;
  rpcUrl: string;
  privateKey: string;
  expectedReplica?: number;
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
  private readonly expectedReplica: number;

  private indexerInstance: Indexer | null = null;
  private signerPromise: Promise<ethers.Wallet> | null = null;

  // skill.id → 0G rootHash
  private readonly skillRoots = new Map<string, string>();
  private readonly skillCache = new Map<string, Skill>();
  // agentId → latest 0G rootHash for that agent's inventory blob
  private readonly inventoryRoots = new Map<string, string>();
  // In-process write-back cache so repeated reads don't hit 0G
  private readonly inventoryCache = new Map<string, string[]>();

  constructor(private readonly cfg: ZeroGStorageConfig) {
    this.maxRetries = cfg.maxRetries ?? 3;
    this.initialBackoffMs = cfg.initialBackoffMs ?? 200;
    this.expectedReplica = cfg.expectedReplica ?? 1;
  }

  async putSkill(skill: Skill): Promise<{ id: string }> {
    return withRetries(() => this.putSkillOnce(skill), this.maxRetries, this.initialBackoffMs);
  }

  async getSkill(id: string): Promise<Skill | null> {
    const cached = this.skillCache.get(id);
    if (cached) return cached;
    const rootHash = this.skillRoots.get(id);
    if (!rootHash) return null;
    return this.downloadSkill(rootHash);
  }

  async listSkills(): Promise<Skill[]> {
    const out: Skill[] = [];
    for (const id of this.skillRoots.keys()) {
      const cached = this.skillCache.get(id);
      if (cached) {
        out.push(cached);
        continue;
      }
      const root = this.skillRoots.get(id)!;
      const downloaded = await this.downloadSkill(root);
      if (downloaded) out.push(downloaded);
    }
    return out;
  }

  async putAgentInventory(agentId: string, skillIds: string[]): Promise<void> {
    const rootHash = await this.uploadBlob({ agentId, skillIds });
    this.inventoryRoots.set(agentId, rootHash);
    this.inventoryCache.set(agentId, skillIds);
  }

  async getAgentInventory(agentId: string): Promise<string[]> {
    const cached = this.inventoryCache.get(agentId);
    if (cached) return cached;
    const rootHash = this.inventoryRoots.get(agentId);
    if (!rootHash) return [];
    const blob = await this.downloadBlob<{ agentId: string; skillIds: string[] }>(rootHash);
    if (!blob) return [];
    this.inventoryCache.set(agentId, blob.skillIds);
    return blob.skillIds;
  }

  // --- engine helpers (not on the IStorageAdapter interface) ---

  seedSkillRoot(skillId: string, rootHash: string): void {
    this.skillRoots.set(skillId, rootHash);
  }

  /** Engine reads rootHashes after putSkill to forward them to future agents. */
  getSkillRoot(skillId: string): string | undefined {
    return this.skillRoots.get(skillId);
  }

  /** Snapshot of the in-memory rootHash map. */
  getAllSkillRoots(): Record<string, string> {
    return Object.fromEntries(this.skillRoots);
  }

  // --- internals ---

  private getIndexer(): Indexer {
    if (!this.indexerInstance) this.indexerInstance = new Indexer(this.cfg.indexerUrl);
    return this.indexerInstance;
  }

  private async getSigner(): Promise<ethers.Wallet> {
    if (!this.signerPromise) {
      this.signerPromise = (async () => {
        const provider = new ethers.JsonRpcProvider(this.cfg.rpcUrl);
        return new ethers.Wallet(this.cfg.privateKey, provider);
      })();
    }
    return this.signerPromise;
  }

  private async putSkillOnce(skill: Skill): Promise<{ id: string }> {
    const indexer = this.getIndexer();
    const signer = await this.getSigner();
    const bytes = new TextEncoder().encode(JSON.stringify(skill));
    const data = new MemData(bytes);
    try {
      // SDK ships dual-package ethers types; cast bypasses ESM/CJS identity mismatch.
      const [result, err] = await indexer.upload(data, this.cfg.rpcUrl, signer as never);
      if (err) throw err;
      if (!result?.rootHash) throw new Error("0G Storage upload returned no rootHash");
      this.skillRoots.set(skill.id, result.rootHash);
      this.skillCache.set(skill.id, skill);
      return { id: skill.id };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      try {
        const bal = await signer.provider!.getBalance(signer.address);
        console.error(
          `[ZeroGStorageAdapter] putSkill failed for ${skill.id} (${signer.address}): ${msg}. Native balance: ${ethers.formatEther(bal)} (need fee+gas; pair ZG_RPC_URL with matching ZG_INDEXER_URL).`,
        );
      } catch {
        console.error(`[ZeroGStorageAdapter] putSkill failed for ${skill.id}: ${msg}`);
      }
      throw e;
    }
  }

  private async uploadBlob(data: unknown): Promise<string> {
    const indexer = this.getIndexer();
    const signer = await this.getSigner();
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    const [result, err] = await indexer.upload(new MemData(bytes), this.cfg.rpcUrl, signer as never);
    if (err) throw err;
    if (!result?.rootHash) throw new Error("0G Storage uploadBlob returned no rootHash");
    return result.rootHash;
  }

  private async downloadBlob<T>(rootHash: string): Promise<T | null> {
    const indexer = this.getIndexer();
    const dir = await mkdtemp(join(tmpdir(), "moirai-blob-"));
    const filePath = join(dir, "blob.json");
    try {
      const err = await indexer.download(rootHash, filePath, false);
      if (err) throw err;
      return JSON.parse(await readFile(filePath, "utf8")) as T;
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async downloadSkill(rootHash: string): Promise<Skill | null> {
    const indexer = this.getIndexer();
    const dir = await mkdtemp(join(tmpdir(), "moirai-skill-"));
    const filePath = join(dir, "skill.json");
    try {
      const err = await indexer.download(rootHash, filePath, false);
      if (err) throw err;
      const text = await readFile(filePath, "utf8");
      const skill = JSON.parse(text) as Skill;
      this.skillCache.set(skill.id, skill);
      return skill;
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
