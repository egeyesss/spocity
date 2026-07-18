"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import { VoxelBuilding } from "@/app/me/city/VoxelBuilding";
import type { Tier } from "@/app/me/city/types";

// The landing hero visual: a tiny slice of an actual Spocity city, rendered
// with the same building components as /me — not an illustration. A curated
// block of districts/tiers slowly rotates; the centerpiece pulses like a
// now-playing tower. Non-interactive (pointer events off) so it never
// hijacks page scroll.

const GROUND = "#262030";
const ASPHALT = "#3c352c";

interface HeroBuilding {
  district: string;
  tier: Tier;
  position: [number, number, number];
}

// Fallback palette only matters for unknown districts — all of these are
// hand-authored in buildingDefs, so it never shows.
const FALLBACK: [string, string, string] = ["#D4D4D8", "#71717A", "#27272A"];

const BUILDINGS: HeroBuilding[] = [
  { district: "electronic", tier: "apartment", position: [-6.5, 0, -4] },
  { district: "hip-hop", tier: "skyscraper", position: [0, 0, -4] },
  { district: "jazz", tier: "skyscraper", position: [6.5, 0, -4] },
  { district: "pop", tier: "house", position: [-6.5, 0, 3.5] },
  { district: "r-and-b-soul", tier: "apartment", position: [0, 0, 3.5] },
  { district: "folk-singer-songwriter", tier: "house", position: [6.5, 0, 3.5] },
  { district: "latin", tier: "shack", position: [-10.5, 0, 3.5] },
  { district: "rock", tier: "shack", position: [10.5, 0, -4] },
];

function Block() {
  const group = useRef<Group>(null);

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.1;
  });

  return (
    <group ref={group}>
      {/* block ground + the street between the two rows */}
      <mesh position={[0, -0.31, 0]}>
        <boxGeometry args={[27, 0.6, 17]} />
        <meshBasicMaterial color={GROUND} />
      </mesh>
      {/* Inset the road inside the ground so its end-cap faces don't sit
          coplanar with the ground's edges — that coincidence was z-fighting
          where the road ends. */}
      <mesh position={[0, -0.28, -0.25]}>
        <boxGeometry args={[26, 0.6, 3.2]} />
        <meshBasicMaterial color={ASPHALT} />
      </mesh>

      {BUILDINGS.map((b) => (
        <VoxelBuilding
          key={`${b.district}-${b.position[0]}-${b.position[2]}`}
          district={b.district}
          tier={b.tier}
          palette={FALLBACK}
          position={b.position}
        />
      ))}
    </group>
  );
}

export default function HeroCity() {
  return (
    <div className="pointer-events-none h-full w-full" aria-hidden>
      <Canvas
        camera={{ position: [30, 22, 38], fov: 26, near: 1, far: 200 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
        onCreated={({ camera }) => camera.lookAt(0, 4.5, 0)}
      >
        <Block />
      </Canvas>
    </div>
  );
}
