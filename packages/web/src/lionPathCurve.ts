import * as THREE from "three";
import type { ScreenPosition } from "./store";

/** Point on quadratic Bézier: B(t) = (1-t)²P0 + 2(1-t)t P1 + t² P2 */
export function quadraticBezier2D(p0: ScreenPosition, p1: ScreenPosition, p2: ScreenPosition, t: number): ScreenPosition {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

/** Control point offset from chord midpoint, perpendicular to start→end (reverse side of arc) */
export function quadraticControl2D(start: ScreenPosition, end: ScreenPosition, bendScale = 0.42): ScreenPosition {
  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const bend = len * bendScale;
  return { x: mx - px * bend, y: my - py * bend };
}

export function quadraticBezier3D(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  t: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const u = 1 - t;
  return out
    .copy(p0)
    .multiplyScalar(u * u)
    .addScaledVector(p1, 2 * u * t)
    .addScaledVector(p2, t * t);
}

/** Control in XZ plane (y preserved from midpoint) for lion sprite path */
export function quadraticControl3DXZ(start: THREE.Vector3, end: THREE.Vector3, bendScale = 0.45): THREE.Vector3 {
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  const dir = new THREE.Vector3(end.x - start.x, 0, end.z - start.z);
  const len = Math.hypot(dir.x, dir.z);
  if (len < 1e-5) return mid.clone().setY(0.95);
  dir.x /= len;
  dir.z /= len;
  const perp = new THREE.Vector3(-dir.z, 0, dir.x);
  const bend = len * bendScale;
  return new THREE.Vector3(mid.x - perp.x * bend, 3.5, mid.z - perp.z * bend);
}

/** B'(t) = 2(1-t)(P1-P0) + 2t(P2-P1); tmp must be a scratch vector */
export function quadraticBezierDerivative3D(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  t: number,
  out: THREE.Vector3,
  tmp: THREE.Vector3,
): THREE.Vector3 {
  const u = 1 - t;
  tmp.subVectors(p1, p0).multiplyScalar(2 * u);
  out.subVectors(p2, p1).multiplyScalar(2 * t);
  return out.add(tmp);
}
