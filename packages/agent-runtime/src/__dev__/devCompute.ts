// DEV-ONLY. Replaced by kernel team's 0g-compute adapter in production.
// Returns canned, deterministic LLM responses keyed off prompt content so
// agent-runtime + engine can run end-to-end without 0G Compute.
//
// Personality-aware: each agent gets different default behaviours to simulate
// the natural divergence a real LLM produces from different personality prompts.

import { createHash } from "node:crypto";
import type { ComputeReceipt } from "@moirai/shared";
import type { IComputeAdapter, InferOptions, InferResult } from "@moirai/kernel";

// Deterministic: same prompt → same hash → same skillId → dedup works correctly.
function fakeReceipt(prompt: string, verifiable: boolean): ComputeReceipt {
  const hash = "0xdev" + createHash("sha256").update(prompt).digest("hex").slice(0, 28);
  return { hash, provider: "dev-fixture", model: "dev-canned-llm", signedAt: 0, verifiable };
}

// --- Extractors (use specific lines so physics rules don't pollute classification) ---

function extractSituation(prompt: string): string {
  return /^Situation:\s*(.+)$/im.exec(prompt)?.[1]?.toLowerCase() ?? "";
}

function extractCrisisType(prompt: string): string {
  return /^Crisis type:\s*(.+)$/im.exec(prompt)?.[1]?.toLowerCase() ?? "";
}

// "You are Alice." → "alice"
function extractAgent(prompt: string): string {
  return /^You are (\w+)\./im.exec(prompt)?.[1]?.toLowerCase() ?? "";
}

// --- Prompt-type detection ---

function isEvalPrompt(p: string): boolean {
  return /score the proposal/i.test(p) || /"score"/i.test(p);
}
function isTickDecision(p: string): boolean {
  return /decide one action/i.test(p);
}
function isPeerAcceptance(p: string): boolean {
  return /would you adopt this skill/i.test(p);
}

// --- Response generators ---

function evalResponse(): string {
  return JSON.stringify({ score: 0.72, failureModes: ["may not work in every situation"] });
}

// Each personality has a natural default activity when not in crisis.
// This simulates the divergence a real LLM produces from different personality prompts.
//   alice (cautious)     → steady foraging — safe, proven
//   bob   (bold)         → experimentation — always testing new techniques
//   cara  (curious)      → farming         — creative, sustainable
//   dave  (strategic)    → foraging        — uses what others proved works
//   eve   (self-reliant) → foraging        — independent, trusts own hands
function tickDecisionResponse(prompt: string): string {
  const p = prompt.toLowerCase();
  const agent = extractAgent(prompt);

  const hungerMatch = /hunger=(\d+)/.exec(p);
  const energyMatch = /energy=(\d+)/.exec(p);
  const hunger = hungerMatch ? Number(hungerMatch[1]) : 0;
  const energy = energyMatch ? Number(energyMatch[1]) : 100;

  // Critical overrides always win.
  if (energy < 25) return JSON.stringify({ action: "rest and recover energy", reason: "energy critically low" });
  if (hunger > 60) return JSON.stringify({ action: "forage for berries", reason: "hunger dangerously high" });

  switch (agent) {
    case "bob":
      return hunger > 25
        ? JSON.stringify({ action: "forage for berries", reason: "hungry enough to gather" })
        : JSON.stringify({ action: "experiment with rocks and sticks", reason: "always testing new techniques" });

    case "cara":
      return hunger > 20
        ? JSON.stringify({ action: "farm grass bundles near water", reason: "curious about sustainable food sources" })
        : JSON.stringify({ action: "rest and recover energy", reason: "well-fed, observing and resting" });

    default:
      // alice, dave, eve: reliable foraging as default.
      return hunger > 20
        ? JSON.stringify({ action: "forage for berries", reason: "maintaining steady food supply" })
        : JSON.stringify({ action: "rest and recover energy", reason: "food good, recovering energy" });
  }
}

// Personality-aware acceptance: bold agents accept more readily, cautious require higher score.
function peerAcceptanceResponse(prompt: string): string {
  const riskMatch = /risk tolerance:\s*([\d.]+)/i.exec(prompt);
  const scoreMatch = /quality score:\s*([\d.]+)/i.exec(prompt);
  const risk = riskMatch ? Number(riskMatch[1]) : 0.5;
  const score = scoreMatch ? Number(scoreMatch[1]) : 0;
  const inCommunity = /trusted community member/i.test(prompt);
  const threshold = 0.65 - (risk - 0.5) * 0.3;
  const accept = score >= threshold || (inCommunity && score >= threshold - 0.1);
  return JSON.stringify({
    accept,
    reason: accept ? "skill looks useful for my situation" : "doesn't match my personality or risk profile",
  });
}

function evolveSkillResponse(prompt: string): string {
  const situation = extractSituation(prompt);
  const crisisType = extractCrisisType(prompt);

  // Crisis: lion or predator attack.
  const isLion =
    crisisType.includes("lion") ||
    situation.includes("lion") ||
    situation.includes("predator") ||
    situation.includes("attack") ||
    situation.includes("stalks");

  if (isLion) {
    return JSON.stringify({
      name: "throw_sharp_rocks",
      description: "Throw sharpened rocks at the predator until it flees",
      preconditions: ["rocks"],
      effect: "scares predator away with pointy thrown projectiles",
      steps: [
        "Pick up rocks from the ground",
        "Sharpen rocks against another stone",
        "Throw rocks at the predator repeatedly",
        "Shout to amplify threat",
      ],
    });
  }

  if (situation.includes("rest") || situation.includes("recover") || situation.includes("energy")) {
    return JSON.stringify({
      name: "mindful_rest",
      description: "Find shade and rest deliberately to recover energy",
      preconditions: [],
      effect: "restores energy by resting in a sheltered spot",
      steps: ["Find a shaded area", "Lie down calmly", "Breathe slowly", "Rest until energy is restored"],
    });
  }

  if (situation.includes("experiment") || situation.includes("rocks") || situation.includes("sticks")) {
    return JSON.stringify({
      name: "stone_tool_craft",
      description: "Strike rocks together to chip sharp edges for multi-purpose use",
      preconditions: ["rocks", "sticks"],
      effect: "crafts sharp stone tools useful for defence and food prep by experimenting",
      steps: ["Select two hard rocks", "Strike at angle to chip edges", "Bind to stick handle", "Test and refine"],
    });
  }

  if (situation.includes("farm") || situation.includes("grass") || situation.includes("plant")) {
    return JSON.stringify({
      name: "grass_bundle_farming",
      description: "Bundle dry grass and plant near water to cultivate food",
      preconditions: ["grass"],
      effect: "grows food over time by farming grass bundles near water",
      steps: ["Gather dry grass", "Bind into bundles", "Plant near water", "Return to harvest"],
    });
  }

  // Default: berry foraging — alice, dave, eve, and any unknown agent.
  return JSON.stringify({
    name: "gather_berries",
    description: "Scout nearby bushes and collect ripe berries to eat",
    preconditions: [],
    effect: "provides food by foraging berries from bushes",
    steps: ["Walk to the nearest bush", "Identify ripe berries", "Pick and collect them", "Eat or store for later"],
  });
}

export class DevComputeAdapter implements IComputeAdapter {
  async infer(prompt: string, opts: InferOptions): Promise<InferResult> {
    let text: string;
    if (isEvalPrompt(prompt))          text = evalResponse();
    else if (isTickDecision(prompt))   text = tickDecisionResponse(prompt);
    else if (isPeerAcceptance(prompt)) text = peerAcceptanceResponse(prompt);
    else                               text = evolveSkillResponse(prompt);
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
