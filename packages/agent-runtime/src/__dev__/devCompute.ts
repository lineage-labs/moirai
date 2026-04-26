// DEV-ONLY. Replaced by kernel team's 0g-compute adapter in production.
// Returns canned, deterministic LLM responses keyed off prompt content so
// agent-runtime + engine can run end-to-end without 0G Compute.

import { createHash, randomUUID } from "node:crypto";
import type { ComputeReceipt } from "@moirai/shared";
import type { IComputeAdapter, InferOptions, InferResult } from "@moirai/kernel";

function fakeReceipt(prompt: string, verifiable: boolean): ComputeReceipt {
  const hash = "0x" + createHash("sha256").update(prompt + randomUUID()).digest("hex").slice(0, 32);
  return {
    hash,
    provider: "dev-fixture",
    model: "dev-canned-llm",
    signedAt: Date.now(),
    verifiable,
  };
}

function reasonResponse(prompt: string): string {
  const p = prompt.toLowerCase();
  if (p.includes("lion")) {
    return JSON.stringify({
      name: "throw_sharp_rocks",
      description: "Throw sharpened rocks at the lion until it flees",
      preconditions: ["rocks"],
      effect: "scares lion away with pointy thrown projectiles",
      steps: [
        "Pick up rocks from the ground",
        "Sharpen rocks against another stone",
        "Throw rocks at the lion repeatedly",
        "Shout to amplify threat",
      ],
    });
  }
  return JSON.stringify({
    name: "wait_and_observe",
    description: "Stand still and observe the situation",
    preconditions: [],
    effect: "buys time to think",
    steps: ["Pause", "Watch", "Listen"],
  });
}

function evalResponse(): string {
  return JSON.stringify({ score: 0.72, failureModes: ["lion may charge before rocks land", "rocks may miss"] });
}

export class DevComputeAdapter implements IComputeAdapter {
  async infer(prompt: string, opts: InferOptions): Promise<InferResult> {
    const isEval = /score the proposal/i.test(prompt) || /\"score\"/i.test(prompt);
    const text = isEval ? evalResponse() : reasonResponse(prompt);
    await delay(10);
    return { text, receipt: fakeReceipt(prompt, opts.verifiable) };
  }

  async verifyReceipt(receipt: ComputeReceipt): Promise<boolean> {
    return receipt.provider === "dev-fixture";
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
