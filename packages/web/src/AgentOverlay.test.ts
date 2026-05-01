import { describe, expect, it } from "vitest";
import { energyRatioFromHunger, resolveAgentLayout } from "./AgentOverlay";

describe("energyRatioFromHunger", () => {
  it("treats hunger as a depleting game power meter", () => {
    expect(energyRatioFromHunger({ current: 0, threshold: 30 })).toBe(1);
    expect(energyRatioFromHunger({ current: 15, threshold: 30 })).toBe(0.5);
    expect(energyRatioFromHunger({ current: 30, threshold: 30 })).toBe(0);
  });
});

describe("resolveAgentLayout", () => {
  it("separates overlapping agent cards inside the playable area", () => {
    const layout = resolveAgentLayout(
      [
        { id: "alice", x: 240, y: 260 },
        { id: "bob", x: 250, y: 270 },
        { id: "charlie", x: 260, y: 280 },
      ],
      { width: 900, height: 640, reservedRight: 454, cardWidth: 176, cardHeight: 236 },
    );

    const boxes = Object.values(layout).map((p) => ({
      left: p.x - 88,
      right: p.x + 88,
      top: p.y - 118,
      bottom: p.y + 118,
    }));

    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlaps = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        expect(overlaps).toBe(false);
      }
    }

    for (const point of Object.values(layout)) {
      expect(point.x).toBeGreaterThanOrEqual(88);
      expect(point.x).toBeLessThanOrEqual(900 - 454 - 88);
    }
  });
});
