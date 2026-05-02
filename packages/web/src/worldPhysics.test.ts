import { describe, expect, it } from "vitest";
import { LION_ENTRY_WORLD_POINT, computeLionFinalPoint, worldPointFromScreenPosition } from "./worldPhysics";

describe("computeLionFinalPoint", () => {
  it("keeps the lion closer to its target than nearby non-target agents", () => {
    const dave = worldPointFromScreenPosition({ x: 420, y: 500 });
    const eve = worldPointFromScreenPosition({ x: 475, y: 490 });

    const final = computeLionFinalPoint({
      targets: [{ id: "dave", point: dave }],
      blockers: [{ id: "eve", point: eve }],
    });

    const distanceToDave = Math.hypot(final.x - dave.x, final.z - dave.z);
    const distanceToEve = Math.hypot(final.x - eve.x, final.z - eve.z);
    expect(distanceToDave).toBeLessThan(distanceToEve);
  });

  it("places the lion equidistant between two targeted agents", () => {
    const alice = worldPointFromScreenPosition({ x: 375, y: 440 });
    const bob = worldPointFromScreenPosition({ x: 555, y: 360 });

    const final = computeLionFinalPoint({
      targets: [
        { id: "alice", point: alice },
        { id: "bob", point: bob },
      ],
      blockers: [],
    });

    const distanceToAlice = Math.hypot(final.x - alice.x, final.z - alice.z);
    const distanceToBob = Math.hypot(final.x - bob.x, final.z - bob.z);
    expect(distanceToAlice).toBeCloseTo(distanceToBob, 6);
  });

  it("keeps strict screen midpoint for two targets even with blockers", () => {
    const alice = worldPointFromScreenPosition({ x: 375, y: 440 });
    const bob = worldPointFromScreenPosition({ x: 555, y: 360 });
    const midX = (alice.x + bob.x) / 2;
    const midZ = (alice.z + bob.z) / 2;
    const eve = worldPointFromScreenPosition({ x: 400, y: 250 });

    const final = computeLionFinalPoint({
      targets: [
        { id: "alice", point: alice },
        { id: "bob", point: bob },
      ],
      blockers: [{ id: "eve", point: eve }],
    });

    expect(final.x).toBeCloseTo(midX, 6);
    expect(final.z).toBeCloseTo(midZ, 6);
  });
});

describe("LION_ENTRY_WORLD_POINT", () => {
  it("starts the lion from the top-left side of the board", () => {
    expect(LION_ENTRY_WORLD_POINT.x).toBeLessThan(0);
    expect(LION_ENTRY_WORLD_POINT.z).toBeLessThan(0);
  });
});
