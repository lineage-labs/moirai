import type { ScreenPosition } from "./store";

export type LayoutPoint = ScreenPosition & { id: string };

export type TinyLayoutOptions = {
  width: number;
  height: number;
  reservedRight: number;
  reservedBottom: number;
  minDistance: number;
};

export function resolveTinyAgentLayout(points: LayoutPoint[], options: TinyLayoutOptions): Record<string, ScreenPosition> {
  const minX = 54;
  const maxX = Math.max(minX, options.width - options.reservedRight - 54);
  const minY = 88;
  const maxY = Math.max(minY, options.height - options.reservedBottom - 58);
  const nodes = points.map((point) => ({
    id: point.id,
    x: clamp(point.x, minX, maxX),
    y: clamp(point.y, minY, maxY),
  }));

  for (let pass = 0; pass < 14; pass += 1) {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.max(0.001, Math.hypot(dx, dy));
        if (distance >= options.minDistance) continue;

        const push = (options.minDistance - distance) / 2;
        const ux = dx / distance;
        const uy = dy / distance;
        a.x = clamp(a.x - ux * push, minX, maxX);
        a.y = clamp(a.y - uy * push, minY, maxY);
        b.x = clamp(b.x + ux * push, minX, maxX);
        b.y = clamp(b.y + uy * push, minY, maxY);
      }
    }
  }

  return Object.fromEntries(nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
