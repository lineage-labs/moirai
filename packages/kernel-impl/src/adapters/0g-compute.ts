import { ethers } from "ethers";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";
import type { Receipt } from "@moirai/shared";
import type { IComputeAdapter, InferOpts, InferResult } from "@moirai/kernel";

export type FallbackProvider = "anthropic" | "openai";

export type ZeroGComputeFallback = {
  provider: FallbackProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
};

export type ZeroGComputeConfig = {
  rpcUrl: string;
  privateKey: string;
  providerAddress?: string;
  preferredModel?: string;
  fallback?: ZeroGComputeFallback;
  timeoutMs?: number;
};

type ResolvedService = {
  providerAddress: string;
  endpoint: string;
  model: string;
  verifiability: string;
};

/** Matches `LedgerProcessor.MIN_LEDGER_BALANCE_OG` in `@0glabs/0g-serving-broker`. */
const MIN_LEDGER_OG = 3;

export class ZeroGComputeAdapter implements IComputeAdapter {
  private brokerPromise: Promise<ZGComputeNetworkBroker> | null = null;
  private readonly acknowledged = new Set<string>();
  private readonly teeAttestationByProvider = new Map<string, boolean>();
  private cachedTeeMl: ResolvedService | null = null;
  private cachedAny: ResolvedService | null = null;
  private cachedPinned: ResolvedService | null = null;

  constructor(private readonly cfg: ZeroGComputeConfig) {}

  async infer(prompt: string, opts: InferOpts): Promise<InferResult> {
    if (opts.verifiable) {
      try {
        return await this.sealedInfer(prompt, opts);
      } catch (sealedErr) {
        if (!this.cfg.fallback) throw sealedErr;
        const fallback = await this.fallbackInfer(prompt, opts);
        return { ...fallback, receipt: { ...fallback.receipt, verifiable: false } };
      }
    }
    if (this.cfg.fallback) return this.fallbackInfer(prompt, opts);
    return this.sealedInfer(prompt, opts);
  }

  async verifyReceipt(receipt: Receipt): Promise<boolean> {
    if (!receipt.verifiable || !receipt.providerAddress) return false;

    const cached = this.teeAttestationByProvider.get(receipt.providerAddress);
    if (cached !== undefined) return cached;

    const broker = await this.getBroker();
    const tmp = await mkdtemp(join(tmpdir(), "moirai-tee-verify-"));
    try {
      const result = await broker.inference.verifyService(receipt.providerAddress, tmp);
      const valid =
        result?.success === true && result.signerVerification?.allMatch === true;
      this.teeAttestationByProvider.set(receipt.providerAddress, valid);
      return valid;
    } catch {
      this.teeAttestationByProvider.set(receipt.providerAddress, false);
      return false;
    } finally {
      await rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * Ensures an on-chain 0G Compute ledger exists and tops up the selected TeeML provider's
   * inference sub-account when it is low. Call before `infer(..., { verifiable: true })` in spikes
   * or long-lived runtimes.
   */
  async ensureComputeLedgerAndInferenceFunds(options?: {
    /** Initial ledger balance when creating (minimum 3 OG). Default 3. */
    createLedgerOg?: number;
    /** Top up provider sub-account by this amount when below threshold. Default 1 OG. */
    inferenceTopUpWei?: bigint;
    /** If sub-account balance is below this, run top-up. Default 0.1 OG. */
    minInferenceSubWei?: bigint;
  }): Promise<void> {
    const broker = await this.getBroker();
    try {
      await broker.ledger.getLedger();
    } catch {
      const og = Math.max(options?.createLedgerOg ?? MIN_LEDGER_OG, MIN_LEDGER_OG);
      await broker.ledger.addLedger(og);
    }

    const svc = await this.resolveService(true);
    await this.ensureAcknowledged(broker, svc.providerAddress);

    const [sub] = await broker.inference.getAccountWithDetail(svc.providerAddress);
    const minWei = options?.minInferenceSubWei ?? ethers.parseEther("0.1");
    const topUp = options?.inferenceTopUpWei ?? ethers.parseEther("1");
    if (sub.balance < minWei) {
      await broker.ledger.transferFund(svc.providerAddress, "inference", topUp);
    }
  }

  private async getBroker(): Promise<ZGComputeNetworkBroker> {
    if (!this.brokerPromise) {
      this.brokerPromise = (async () => {
        const provider = new ethers.JsonRpcProvider(this.cfg.rpcUrl);
        const wallet = new ethers.Wallet(this.cfg.privateKey, provider);
        const require = createRequire(import.meta.url);
        const { createZGComputeNetworkBroker } = require("@0glabs/0g-serving-broker") as {
          createZGComputeNetworkBroker: (signer: unknown) => ZGComputeNetworkBroker;
        };
        // SDK ships dual-package ethers types; cast bypasses ESM/CJS identity mismatch.
        return createZGComputeNetworkBroker(wallet as never);
      })();
    }
    return this.brokerPromise;
  }

  private async resolveService(verifiable: boolean): Promise<ResolvedService> {
    if (this.cfg.providerAddress) {
      if (this.cachedPinned) return this.cachedPinned;
      const broker = await this.getBroker();
      const services = await broker.inference.listService();
      const svc = services.find((s) => s.provider === this.cfg.providerAddress);
      if (!svc) throw new Error(`pinned provider ${this.cfg.providerAddress} not in service list`);
      const meta = await broker.inference.getServiceMetadata(this.cfg.providerAddress);
      this.cachedPinned = {
        providerAddress: this.cfg.providerAddress,
        endpoint: meta.endpoint,
        model: this.cfg.preferredModel ?? meta.model,
        verifiability: svc.verifiability ?? "",
      };
      return this.cachedPinned;
    }

    if (verifiable && this.cachedTeeMl) return this.cachedTeeMl;
    if (!verifiable && this.cachedAny) return this.cachedAny;

    const broker = await this.getBroker();
    const services = await broker.inference.listService();
    const candidates = services.filter((s) => {
      if (s.serviceType !== "chatbot") return false;
      if (verifiable && s.verifiability !== "TeeML") return false;
      if (this.cfg.preferredModel && s.model !== this.cfg.preferredModel) return false;
      return true;
    });
    if (candidates.length === 0) {
      throw new Error(
        `no 0G Compute provider matched (verifiable=${verifiable}, model=${this.cfg.preferredModel ?? "any"})`,
      );
    }
    const sorted = [...candidates].sort((a, b) => Number(a.inputPrice) - Number(b.inputPrice));
    const best = sorted[0]!;
    const meta = await broker.inference.getServiceMetadata(best.provider);
    const resolved: ResolvedService = {
      providerAddress: best.provider,
      endpoint: meta.endpoint,
      model: this.cfg.preferredModel ?? meta.model,
      verifiability: best.verifiability ?? "",
    };
    if (verifiable) this.cachedTeeMl = resolved;
    else this.cachedAny = resolved;
    return resolved;
  }

  private async ensureAcknowledged(broker: ZGComputeNetworkBroker, providerAddress: string): Promise<void> {
    if (this.acknowledged.has(providerAddress)) return;
    try {
      await broker.inference.acknowledgeProviderSigner(providerAddress);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/already|acknowledged/i.test(msg)) throw err;
    }
    this.acknowledged.add(providerAddress);
  }

  private async sealedInfer(prompt: string, opts: InferOpts): Promise<InferResult> {
    const broker = await this.getBroker();
    const svc = await this.resolveService(true);
    await this.ensureAcknowledged(broker, svc.providerAddress);

    const headers = await broker.inference.getRequestHeaders(svc.providerAddress);
    const body: Record<string, unknown> = {
      messages: [{ role: "user", content: prompt }],
      model: svc.model,
    };
    if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
    if (opts.temperature !== undefined) body.temperature = opts.temperature;

    const response = await this.fetchWithTimeout(
      `${svc.endpoint}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(headers as unknown as Record<string, string>),
        },
        body: JSON.stringify(body),
      },
      this.cfg.timeoutMs ?? 60_000,
    );

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(`0G Compute HTTP ${response.status}: ${errBody.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      id?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: unknown;
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) throw new Error("0G Compute returned empty content");

    const chatID =
      response.headers.get("ZG-Res-Key") ?? response.headers.get("zg-res-key") ?? data.id;
    if (!chatID) throw new Error("0G Compute response missing chatID (no ZG-Res-Key and no data.id)");

    const usageData = JSON.stringify(data.usage ?? {});

    let processed: boolean | null = null;
    try {
      processed = await broker.inference.processResponse(svc.providerAddress, chatID, usageData);
    } catch (err) {
      throw new Error(
        `0G Compute processResponse failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const verified = svc.verifiability === "TeeML" && processed === true;

    return {
      text,
      receipt: {
        hash: chatID,
        verifiable: verified,
        model: svc.model,
        createdAt: Date.now(),
        providerAddress: svc.providerAddress,
        usageData,
      },
    };
  }

  private async fallbackInfer(prompt: string, opts: InferOpts): Promise<InferResult> {
    if (!this.cfg.fallback) {
      throw new Error("ZeroGComputeAdapter.fallbackInfer: cfg.fallback not set");
    }
    const fb = this.cfg.fallback;
    if (fb.provider === "openai") return this.openaiCompatInfer(fb, prompt, opts);
    return this.anthropicInfer(fb, prompt, opts);
  }

  private async openaiCompatInfer(
    fb: ZeroGComputeFallback,
    prompt: string,
    opts: InferOpts,
  ): Promise<InferResult> {
    const baseUrl = fb.baseUrl ?? "https://api.openai.com/v1";
    const body: Record<string, unknown> = {
      model: fb.model,
      messages: [{ role: "user", content: prompt }],
    };
    if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
    if (opts.temperature !== undefined) body.temperature = opts.temperature;

    const response = await this.fetchWithTimeout(
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${fb.apiKey}` },
        body: JSON.stringify(body),
      },
      this.cfg.timeoutMs ?? 60_000,
    );
    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(`Fallback OpenAI HTTP ${response.status}: ${errBody.slice(0, 300)}`);
    }
    const data = (await response.json()) as {
      id?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    return {
      text,
      receipt: {
        hash: `oai:${data.id ?? Date.now()}`,
        verifiable: false,
        model: fb.model,
        createdAt: Date.now(),
      },
    };
  }

  private async anthropicInfer(
    fb: ZeroGComputeFallback,
    prompt: string,
    opts: InferOpts,
  ): Promise<InferResult> {
    const baseUrl = fb.baseUrl ?? "https://api.anthropic.com/v1";
    const body: Record<string, unknown> = {
      model: fb.model,
      max_tokens: opts.maxTokens ?? 1024,
      messages: [{ role: "user", content: prompt }],
    };
    if (opts.temperature !== undefined) body.temperature = opts.temperature;

    const response = await this.fetchWithTimeout(
      `${baseUrl}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": fb.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      },
      this.cfg.timeoutMs ?? 60_000,
    );
    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(`Fallback Anthropic HTTP ${response.status}: ${errBody.slice(0, 300)}`);
    }
    const data = (await response.json()) as {
      id?: string;
      content?: Array<{ type: string; text?: string }>;
    };
    const text = (data.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
    return {
      text,
      receipt: {
        hash: `ant:${data.id ?? Date.now()}`,
        verifiable: false,
        model: fb.model,
        createdAt: Date.now(),
      },
    };
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}
