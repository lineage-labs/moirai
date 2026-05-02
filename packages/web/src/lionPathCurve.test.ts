import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  quadraticBezier2D,
  quadraticBezier3D,
  quadraticBezierDerivative3D,
  quadraticControl2D,
  quadraticControl3DXZ,
} from "./lionPathCurve";

describe("lionPathCurve", () => {
  it("places 2D control off the straight chord", () => {
    const start = { x: 0, y: 0 };
    const end = { x: 100, y: 0 };
    const c = quadraticControl2D(start, end, 0.42);
    expect(c.y).not.toBe(0);
    expect(Math.abs(c.x - 50)).toBeLessThan(1e-6);
  });

  it("interpolates endpoints on quadratic 2D", () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 50, y: 50 };
    const p2 = { x: 100, y: 0 };
    expect(quadraticBezier2D(p0, p1, p2, 0)).toEqual(p0);
    expect(quadraticBezier2D(p0, p1, p2, 1)).toEqual(p2);
  });

  it("interpolates endpoints on quadratic 3D", () => {
    const p0 = new THREE.Vector3(0, 1, 0);
    const p1 = new THREE.Vector3(1, 1, 1);
    const p2 = new THREE.Vector3(2, 1, 0);
    const out = new THREE.Vector3();
    expect(quadraticBezier3D(p0, p1, p2, 0, out).equals(p0)).toBe(true);
    expect(quadraticBezier3D(p0, p1, p2, 1, out).distanceTo(p2)).toBeLessThan(1e-5);
  });

  it("offsets 3D control perpendicular to XZ chord", () => {
    const start = new THREE.Vector3(-2, 0.95, -1);
    const end = new THREE.Vector3(2, 0.95, 1);
    const c = quadraticControl3DXZ(start, end, 0.45);
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    expect(Math.hypot(c.x - mid.x, c.z - mid.z)).toBeGreaterThan(0.1);
  });

  it("returns non-zero tangent for quadratic 3D derivative mid-curve", () => {
    const p0 = new THREE.Vector3(0, 1, 0);
    const p1 = new THREE.Vector3(1, 1, 1);
    const p2 = new THREE.Vector3(2, 1, 0);
    const out = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    quadraticBezierDerivative3D(p0, p1, p2, 0.5, out, tmp);
    expect(out.length()).toBeGreaterThan(0.01);
  });
});
