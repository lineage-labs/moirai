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

    expect(useStore.getState().agents["alice"]?.position).toEqual({ x: 80, y: 300 });
    expect(useStore.getState().agents["bob"]?.position).toEqual({ x: 310, y: 70 });
    expect(useStore.getState().agents["charlie"]?.position).toEqual({ x: 540, y: 295 });
    expect(useStore.getState().agents["dave"]?.position).toEqual({ x: 90, y: 500 });
    expect(useStore.getState().agents["eve"]?.position).toEqual({ x: 440, y: 430 });
  });
});
