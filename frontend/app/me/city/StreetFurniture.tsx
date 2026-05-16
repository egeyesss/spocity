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
          <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[ISLAND_R + 0.5, ISLAND_R + 0.6, 0.2, 28]} />
            <meshStandardMaterial color="#8C8C88" roughness={0.9} />
          </mesh>
          {/* grass top */}
          <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[ISLAND_R, ISLAND_R, 0.18, 28]} />
            <meshStandardMaterial color="#3F8E45" roughness={0.85} />
          </mesh>
          {/* centerpiece tree */}
          <mesh position={[0, 0.95, 0]} castShadow>
            <boxGeometry args={[0.34, 1.0, 0.34]} />
            <meshStandardMaterial color="#6B4F2A" roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.75, 0]} castShadow>
            <boxGeometry args={[1.5, 1.2, 1.5]} />
            <meshStandardMaterial color="#2F8F3C" roughness={0.8} />
          </mesh>
          <mesh position={[0, 2.5, 0]} castShadow>
            <boxGeometry args={[0.95, 0.75, 0.95]} />
            <meshStandardMaterial color="#37A347" roughness={0.8} />
          </mesh>
        </group>
      ))}
    </>
  );
}
