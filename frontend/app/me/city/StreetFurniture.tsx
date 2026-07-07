"use client";

import { ROAD_WIDTH } from "./constants";
import type { Intersection } from "./grid";

export const ISLAND_R = ROAD_WIDTH * 0.26;

/**
 * A raised planted island at every road intersection. It is fully 3D and sits
 * *above* the road surface (no flat decals coplanar with the pavement), so it
 * can't z-fight. Cars steer around it (see Cars.tsx), so its height is free.
 */
export function StreetFurniture({
  intersections,
}: {
  intersections: Intersection[];
}) {
  if (intersections.length === 0) return null;

  return (
    <>
      {intersections.map((p, i) => (
        <group key={`rb-${i}`} position={[p.x, 0, p.z]}>
          {/* stone curb ring (bottom lifted clear of the road) */}
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[ISLAND_R + 0.5, ISLAND_R + 0.6, 0.2, 28]} />
            <meshBasicMaterial color="#57514a" />
          </mesh>
          {/* grass top */}
          <mesh position={[0, 0.38, 0]}>
            <cylinderGeometry args={[ISLAND_R, ISLAND_R, 0.18, 28]} />
            <meshBasicMaterial color="#2E5133" />
          </mesh>
          {/* centerpiece tree */}
          <mesh position={[0, 0.95, 0]}>
            <boxGeometry args={[0.34, 1.0, 0.34]} />
            <meshBasicMaterial color="#4a3620" />
          </mesh>
          <mesh position={[0, 1.75, 0]}>
            <boxGeometry args={[1.5, 1.2, 1.5]} />
            <meshBasicMaterial color="#22502c" />
          </mesh>
          <mesh position={[0, 2.5, 0]}>
            <boxGeometry args={[0.95, 0.75, 0.95]} />
            <meshBasicMaterial color="#2d6338" />
          </mesh>
        </group>
      ))}
    </>
  );
}
