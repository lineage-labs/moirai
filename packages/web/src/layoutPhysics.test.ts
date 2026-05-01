import { describe, expect, it } from "vitest";
import { resolveTinyAgentLayout } from "./layoutPhysics";

describe("resolveTinyAgentLayout", () => {
  it("separates overlapping tiny agents with a physics relaxation pass", () => {
    const layout = resolveTinyAgentLayout(
      [
        { id: "charlie", x: 500, y: 280 },
        { id: "frank", x: 508, y: 286 },
      ],
      { width: 1024, height: 768, reservedRight: 250, reservedBottom: 96, minDistance: 64 },
    );

    const charlie = layout["charlie"]!;
    const frank = layout["frank"]!;
    expect(Math.hypot(charlie.x - frank.x, charlie.y - frank.y)).toBeGreaterThanOrEqual(63);
  });
});
