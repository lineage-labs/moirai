import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./store";

describe("web store crisis state", () => {
  beforeEach(() => {
    useStore.setState({
      agents: {},
      events: [],
      skills: {},
      crises: {},
      edges: [],
      tick: 0,
      screenPositions: {},
      lionState: { active: false, targets: [] },
      selectedAgentId: null,
      walkOffsets: {},
      skillTransfers: [],
    });
  });

  it("activates and clears lion state from crisis events", () => {
    const store = useStore.getState();

    store.handleEvent({
      kind: "CRISIS_STARTED",
      tick: 7,
      actorId: "engine",
      payload: {
        id: "crisis-1",
        type: "LION",
        targets: ["alice", "bob"],
        startedAtTick: 7,
        deadlineTicks: 12,
      },
    });

    expect(useStore.getState().lionState).toEqual({
      active: true,
      crisisId: "crisis-1",
      targets: ["alice", "bob"],
    });

    useStore.getState().handleEvent({
      kind: "CRISIS_OVER",
      tick: 12,
      actorId: "engine",
      payload: {
        crisisId: "crisis-1",
        survived: ["alice", "bob"],
        killed: [],
      },
    });

    expect(useStore.getState().lionState).toEqual({
      active: false,
      targets: [],
    });
  });

  it("clears target crisis status when engine resolves a lion crisis", () => {
    const store = useStore.getState();

    store.handleEvent({ kind: "AGENT_SPAWNED", tick: 0, actorId: "alice", payload: { personalityId: "alice" } });
    useStore.getState().handleEvent({ kind: "AGENT_SPAWNED", tick: 0, actorId: "bob", payload: { personalityId: "bob" } });

    useStore.getState().handleEvent({
      kind: "CRISIS_STARTED",
      tick: 7,
      actorId: "engine",
      payload: {
        id: "crisis-1",
        type: "LION",
        targets: ["alice", "bob"],
      },
    });

    expect(useStore.getState().agents["alice"]?.status).toBe("crisis");
    expect(useStore.getState().agents["bob"]?.status).toBe("crisis");

    useStore.getState().handleEvent({
      kind: "CRISIS_RESOLVED",
      tick: 11,
      actorId: "engine",
      payload: {
        crisisId: "crisis-1",
        survived: ["alice", "bob"],
        died: [],
        totalAlive: 2,
      },
    });

    expect(useStore.getState().lionState).toEqual({
      active: false,
      targets: [],
    });
    expect(useStore.getState().agents["alice"]?.status).toBe("idle");
    expect(useStore.getState().agents["bob"]?.status).toBe("idle");
  });

  it("spawns primary agents away from the event panel area", () => {
    const store = useStore.getState();

    for (const id of ["alice", "bob", "charlie", "dave", "eve"]) {
      store.handleEvent({ kind: "AGENT_SPAWNED", tick: 0, actorId: id, payload: { personalityId: id } });
    }

    const agents = useStore.getState().agents;
    expect(agents["alice"]?.position).toEqual({ x: 330, y: 300 });
    expect(agents["bob"]?.position).toEqual({ x: 395, y: 318 });
    expect(agents["charlie"]?.position).toEqual({ x: 545, y: 250 });
    expect(agents["dave"]?.position).toEqual({ x: 420, y: 500 });
    expect(agents["eve"]?.position).toEqual({ x: 610, y: 390 });

    const alice = agents["alice"]!.position;
    const bob = agents["bob"]!.position;
    expect(Math.hypot(alice.x - bob.x, alice.y - bob.y)).toBeLessThan(80);
  });

  it("spawns replacement agents away from Charlie to avoid late-game overlap", () => {
    const store = useStore.getState();

    for (const id of ["alice", "bob", "charlie", "dave", "eve", "frank"]) {
      store.handleEvent({ kind: "AGENT_SPAWNED", tick: 0, actorId: id, payload: { personalityId: id } });
    }

    const charlie = useStore.getState().agents["charlie"]!.position;
    const frank = useStore.getState().agents["frank"]!.position;
    expect(Math.hypot(charlie.x - frank.x, charlie.y - frank.y)).toBeGreaterThan(120);
  });

  it("stores selected agent id for the details panel", () => {
    useStore.getState().selectAgent("alice");
    expect(useStore.getState().selectedAgentId).toBe("alice");

    useStore.getState().selectAgent(null);
    expect(useStore.getState().selectedAgentId).toBeNull();
  });

  it("stores crisis timing for ETA and lion approach progress", () => {
    useStore.getState().handleEvent({
      kind: "CRISIS_STARTED",
      tick: 9,
      actorId: "engine",
      payload: {
        id: "lion-9",
        type: "LION",
        description: "Lion attack",
        targets: ["alice"],
        startedAtTick: 9,
        deadlineTicks: 6,
      },
    });

    expect(useStore.getState().crises["lion-9"]).toMatchObject({
      startedAtTick: 9,
      deadlineTicks: 6,
      targets: ["alice"],
    });
  });

  it("regenerates small walking offsets on each world tick", () => {
    const store = useStore.getState();
    store.handleEvent({ kind: "AGENT_SPAWNED", tick: 0, actorId: "alice", payload: { personalityId: "alice" } });
    useStore.getState().handleEvent({ kind: "WORLD_TICK", tick: 1, actorId: "engine" });

    const offset = useStore.getState().walkOffsets["alice"];
    expect(offset).toBeDefined();
    expect(Math.abs(offset!.dx)).toBeLessThanOrEqual(6);
    expect(Math.abs(offset!.dy)).toBeLessThanOrEqual(6);
  });

  it("enqueues a named skill transfer when a skill is learned", () => {
    const store = useStore.getState();
    store.handleEvent({
      kind: "SKILL_ACCEPTED",
      tick: 2,
      actorId: "alice",
      payload: {
        skill: {
          id: "skill-rock",
          name: "Throw Sharp Rocks",
          provenance: {
            inventedBy: "alice",
            inventedAt: 2,
            reasonReceipt: "reason",
            selfEvalReceipt: "eval",
            selfEvalScore: 0.8,
          },
        },
      },
    });
    useStore.getState().handleEvent({
      kind: "SKILL_LEARNED",
      tick: 3,
      actorId: "bob",
      payload: { from: "alice", skillId: "skill-rock" },
    });

    expect(useStore.getState().skillTransfers[0]).toMatchObject({
      from: "alice",
      to: "bob",
      skillName: "Throw Sharp Rocks",
    });
  });

  it("enqueues skill transfer animations for repeated taught events", () => {
    const store = useStore.getState();
    store.handleEvent({
      kind: "SKILL_ACCEPTED",
      tick: 2,
      actorId: "alice",
      payload: {
        skill: {
          id: "skill-rock",
          name: "Throw Sharp Rocks",
          provenance: {
            inventedBy: "alice",
            inventedAt: 2,
            reasonReceipt: "reason",
            selfEvalReceipt: "eval",
            selfEvalScore: 0.8,
          },
        },
      },
    });

    useStore.getState().handleEvent({ kind: "SKILL_TAUGHT", tick: 3, actorId: "alice", payload: { to: "bob", skillId: "skill-rock" } });
    useStore.getState().handleEvent({ kind: "SKILL_TAUGHT", tick: 4, actorId: "alice", payload: { to: "bob", skillId: "skill-rock" } });

    expect(useStore.getState().skillTransfers).toHaveLength(2);
    expect(useStore.getState().skillTransfers[1]).toMatchObject({
      from: "alice",
      to: "bob",
      skillName: "Throw Sharp Rocks",
    });
  });
});
