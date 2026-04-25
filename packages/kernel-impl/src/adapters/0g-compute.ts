import type { Receipt } from "@moirai/shared";
import type { IComputeAdapter, InferOpts, InferResult } from "@moirai/kernel";

export type ZeroGComputeConfig = {
  endpoint: string;
  apiKey?: string;
  model?: string;
  fallbackProvider?: "anthropic" | "openai";
  fallbackModel?: string;
  fallbackApiKey?: string;
  timeoutMs?: number;
};

export class ZeroGComputeAdapter implements IComputeAdapter {
  constructor(private readonly cfg: ZeroGComputeConfig) {}

  async infer(prompt: string, opts: InferOpts): Promise<InferResult> {
    if (opts.verifiable) {
      try {
        return await this.sealedInfer(prompt, opts);
      } catch {
        const fallback = await this.fallbackInfer(prompt, opts);
        return { ...fallback, receipt: { ...fallback.receipt, verifiable: false } };
      }
    }
    return this.fallbackInfer(prompt, opts);
  }

  async verifyReceipt(_receipt: Receipt): Promise<boolean> {
    throw new Error(
      `ZeroGComputeAdapter.verifyReceipt not wired. Wire 0G TEE attestation check after spike. endpoint=${this.cfg.endpoint}`,
    );
  }

  private async sealedInfer(_prompt: string, _opts: InferOpts): Promise<InferResult> {
    throw new Error(
      `ZeroGComputeAdapter.sealedInfer not wired. Wire 0G Compute serving-broker SDK after spike. endpoint=${this.cfg.endpoint}`,
    );
  }

  private async fallbackInfer(_prompt: string, _opts: InferOpts): Promise<InferResult> {
    throw new Error(
      `ZeroGComputeAdapter.fallbackInfer not wired. Wire ${this.cfg.fallbackProvider ?? "anthropic|openai"} client. model=${this.cfg.fallbackModel ?? "unset"}`,
    );
  }
}
