import { describe, expect, it } from "vitest";
import { computeLionFinalPoint, worldPointFromScreenPosition } from "./worldPhysics";

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
});
