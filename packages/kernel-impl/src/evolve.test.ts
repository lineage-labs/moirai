import { describe, it, expect } from "vitest";
import { createKernel } from "./index.js";
import type {
  IComputeAdapter,
  IStorageAdapter,
  INetworkAdapter,
  InferOpts,
  InferResult,
  AxlInbound,
} from "@moirai/kernel";
import type {
  Skill,
  DomainEvent,
  Receipt,
  Personality,
  Environment,
  Crisis,
  AgentContext,
  CandidateSkill,
} from "@moirai/shared";

class StubCompute implements IComputeAdapter {
  constructor(private readonly responses: Array<{ text: string; verifiable?: boolean }>) {}
  async infer(_prompt: string, _opts: InferOpts): Promise<InferResult> {
    const r = this.responses.shift();
    if (!r) throw new Error("StubCompute exhausted");
    const receipt: Receipt = {
      hash: "0x" + Math.random().toString(16).slice(2, 10),
      verifiable: r.verifiable ?? true,
      createdAt: Date.now(),
    };
    return { text: r.text, receipt };
  }
  async verifyReceipt(_r: Receipt): Promise<boolean> {
    return true;
  }
}

class StubStorage implements IStorageAdapter {
  skills = new Map<string, Skill>();
  inventories = new Map<string, string[]>();
  async putSkill(skill: Skill) {
    this.skills.set(skill.id, skill);
    return { id: skill.id };
  }
  async getSkill(id: string) {
    return this.skills.get(id) ?? null;
  }
  async listSkills() {
    return [...this.skills.values()];
  }
  async putAgentInventory(agentId: string, skillIds: string[]) {
    this.inventories.set(agentId, skillIds);
  }
  async getAgentInventory(agentId: string) {
    return this.inventories.get(agentId) ?? [];
  }
  async putAgentCautions() {}
  async getAgentCautions() { return {}; }
}

class StubNetwork implements INetworkAdapter {
  async whisper() {}
  async broadcast() {}
  subscribe(_h: (msg: AxlInbound) => void): () => void {
    return () => {};
  }
  async topology(): Promise<string[]> {
    return [];
  }
  myPeerId(): string {
    return "self";
  }
}

const personality: Personality = {
  id: "alice",
  name: "Alice",
  traits: ["cautious"],
  risk: 0.5,
  innateSkills: [],
  promptFragments: {},
};

const environment: Environment = {
  id: "savannah",
  physics: ["rocks fly", "lions fear pointy things"],
  resources: ["rocks", "sticks"],
  topology: "open",
  crisisSchedule: [],
};

const crisis: Crisis = {
  id: "crisis_1",
  type: "LION",
  description: "A lion approaches.",
  startedAtTick: 40,
  deadlineTicks: 5,
  affectedAgents: ["alice"],
};

const context: AgentContext = {
  agentId: "alice",
  tick: 41,
  inventory: ["rocks", "sticks"],
  knownSkillIds: [],
};

const candidate: CandidateSkill = {
  name: "throw_sharp_rocks",
  description: "Throw rocks at the lion to scare it off.",
  preconditions: ["rocks"],
  effect: "frightens lions",
  steps: ["pick up rocks", "throw at lion"],
};
const candidateText = JSON.stringify(candidate);

type EmittedEvent = Omit<DomainEvent, "tick" | "actorId">;

describe("evolve", () => {
  it("accepts a candidate when self-eval score >= threshold", async () => {
    const compute = new StubCompute([
      { text: candidateText },
      { text: JSON.stringify({ score: 0.8, failureModes: ["lion in tall grass"] }) },
    ]);
    const storage = new StubStorage();
    const network = new StubNetwork();
    const events: EmittedEvent[] = [];
    const kernel = await createKernel({
      compute, storage, network,
      personality, environment, agentId: context.agentId,
      emit: (e: EmittedEvent) => events.push(e),
    });

    const result = await kernel.evolve({
      tick: context.tick,
      situation: crisis.description,
      crisis,
      inventory: context.inventory,
      knownSkills: [],
    });

    expect(result.status).toBe("accepted");
    if (result.status === "accepted") {
      expect(result.skill.name).toBe("throw_sharp_rocks");
      expect(result.skill.provenance.selfEvalScore).toBe(0.8);
      expect(storage.skills.size).toBe(1);
    }
    expect(events.map((e) => e.type)).toEqual([
      "REASONING_STARTED",
      "SKILL_PROPOSED",
      "SELF_EVAL_STARTED",
      "SELF_EVAL_RESULT",
      "SKILL_ACCEPTED",
    ]);
  });

  it("rejects a candidate when self-eval score < threshold", async () => {
    const compute = new StubCompute([
      { text: candidateText },
      { text: JSON.stringify({ score: 0.3, failureModes: ["rocks bounce off lions"] }) },
    ]);
    const storage = new StubStorage();
    const network = new StubNetwork();
    const events: EmittedEvent[] = [];
    const kernel = await createKernel({
      compute, storage, network,
      personality, environment, agentId: context.agentId,
      emit: (e: EmittedEvent) => events.push(e),
    });

    const result = await kernel.evolve({
      tick: context.tick,
      situation: crisis.description,
      crisis,
      inventory: context.inventory,
      knownSkills: [],
    });
    expect(result.status).toBe("rejected");
    expect(storage.skills.size).toBe(0);
    expect(events.map((e) => e.type)).toContain("SKILL_REJECTED");
    expect(events.map((e) => e.type)).not.toContain("SKILL_ACCEPTED");
  });

  it("lowers threshold for higher-risk personality (formula 0.6 - (risk - 0.5)*0.4)", async () => {
    const reckless: Personality = { ...personality, id: "reck", name: "Reck", risk: 0.9 };
    // threshold = 0.6 - (0.9 - 0.5) * 0.4 = 0.44; 0.5 >= 0.44 → accept
    const compute = new StubCompute([
      { text: candidateText },
      { text: JSON.stringify({ score: 0.5, failureModes: [] }) },
    ]);
    const storage = new StubStorage();
    const network = new StubNetwork();
    const events: EmittedEvent[] = [];
    const kernel = await createKernel({
      compute, storage, network,
      personality: reckless, environment, agentId: context.agentId,
      emit: (e: EmittedEvent) => events.push(e),
    });

    const result = await kernel.evolve({
      tick: context.tick,
      situation: crisis.description,
      crisis,
      inventory: context.inventory,
      knownSkills: [],
    });
    expect(result.status).toBe("accepted");
  });

  it("throws EvolveError when reasoning receipt is not verifiable", async () => {
    const compute = new StubCompute([{ text: candidateText, verifiable: false }]);
    const storage = new StubStorage();
    const network = new StubNetwork();
    const events: EmittedEvent[] = [];
    const kernel = await createKernel({
      compute, storage, network,
      personality, environment, agentId: context.agentId,
      emit: (e: EmittedEvent) => events.push(e),
    });

    await expect(
      kernel.evolve({
        tick: context.tick,
        situation: crisis.description,
        crisis,
        inventory: context.inventory,
        knownSkills: [],
      }),
    ).rejects.toThrow(/non-verifiable/);
  });

  it("throws EvolveError when self-eval receipt is not verifiable", async () => {
    const compute = new StubCompute([
      { text: candidateText },
      { text: JSON.stringify({ score: 0.9, failureModes: [] }), verifiable: false },
    ]);
    const storage = new StubStorage();
    const network = new StubNetwork();
    const events: EmittedEvent[] = [];
    const kernel = await createKernel({
      compute, storage, network,
      personality, environment, agentId: context.agentId,
      emit: (e: EmittedEvent) => events.push(e),
    });

    await expect(
      kernel.evolve({
        tick: context.tick,
        situation: crisis.description,
        crisis,
        inventory: context.inventory,
        knownSkills: [],
      }),
    ).rejects.toThrow(/non-verifiable/);
  });
});
