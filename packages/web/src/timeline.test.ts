import { describe, expect, it } from "vitest";
import type { GameEvent } from "./store";
import { pickTickHeadline, tickHeadlines } from "./timeline";

describe("pickTickHeadline", () => {
  it("chooses the highest-priority event for a tick", () => {
    const events: GameEvent[] = [
      { kind: "AGENT_SPAWNED", tick: 5, actorId: "alice", payload: { personalityId: "alice" } },
      { kind: "SKILL_LEARNED", tick: 5, actorId: "bob", payload: { from: "alice", skillId: "skill-rock" } },
      { kind: "CRISIS_STARTED", tick: 5, actorId: "engine", payload: { id: "lion-5", type: "LION", targets: ["bob"] } },
    ];

    expect(pickTickHeadline(events, 5)).toEqual({
      kind: "CRISIS_STARTED",
      title: "Lion attack",
      actorId: "engine",
    });
  });

  it("returns an idle headline when a tick has no visible events", () => {
    expect(pickTickHeadline([], 12)).toEqual({
      kind: "IDLE",
      title: "World breathing",
      actorId: "world",
    });
  });

  it("returns multiple emitted events for a single bottom timeline tick", () => {
    const events: GameEvent[] = [
      { kind: "CRISIS_STARTED", tick: 8, actorId: "engine", payload: { id: "lion-8", type: "LION", targets: ["alice"] } },
      { kind: "SKILL_ACCEPTED", tick: 8, actorId: "alice", payload: { skill: { id: "skill-rock", name: "Throw Sharp Rocks" } } },
      { kind: "SKILL_LEARNED", tick: 8, actorId: "bob", payload: { from: "alice", skillId: "skill-rock" } },
    ];

    expect(tickHeadlines(events, 8).map((headline) => headline.kind)).toEqual([
      "CRISIS_STARTED",
      "SKILL_ACCEPTED",
      "SKILL_LEARNED",
    ]);
  });
});
