import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { quadraticBezier3D } from "../lionPathCurve";
import type { LionRoute } from "../lionHuntRoute";

const CURVE_SEGMENTS = 80;

type Props = {
  route: LionRoute;
  active: boolean;
  hasTargets: boolean;
};

export function LionHuntPath3D({ route, active, hasTargets }: Props) {
  const lineObject = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array((CURVE_SEGMENTS + 1) * 3);
    const tmp = new THREE.Vector3();
    for (let i = 0; i <= CURVE_SEGMENTS; i++) {
      const t = i / CURVE_SEGMENTS;
      quadraticBezier3D(route.start, route.control, route.final, t, tmp);
      positions[i * 3] = tmp.x;
      positions[i * 3 + 1] = tmp.y;
      positions[i * 3 + 2] = tmp.z;
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.LineDashedMaterial({
      color: new THREE.Color(0xb5050a),
      transparent: true,
      opacity: 1,
      dashSize: 0.38,
      gapSize: 0.09,
      depthWrite: false,
    });

    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    line.computeLineDistances();
    return line;
  }, [route]);

  useEffect(() => {
    return () => {
      lineObject.geometry.dispose();
      (lineObject.material as THREE.Material).dispose();
    };
  }, [lineObject]);

  if (!active || !hasTargets) return null;

  return <primitive object={lineObject} dispose={null} />;
}
