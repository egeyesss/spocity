"use client";

import { OrbitControls } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useMemo } from "react";
import { FALLBACK_PALETTE, TIER_HEIGHT } from "./constants";
import type { BucketRow, PlacedArtist } from "./types";
import { VoxelBuilding } from "./VoxelBuilding";

interface CitySceneProps {
  artists: PlacedArtist[];
  buckets: BucketRow[];
  hoveredId: string | null;
  selectedId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
}

/**
 * Everything that lives inside <Canvas>. Lights, ground, OrbitControls, buildings.
 * Pure 3D — no DOM. (Tooltip DOM lives in CityCanvas, anchored by drei's <Html>.)
 */
export function CityScene({
  artists,
  buckets,
  hoveredId,
  selectedId,
  onHover,
  onSelect,
}: CitySceneProps) {
  const paletteForBucket = useMemo(() => {
    const map = new Map<string, [string, string, string]>();
    for (const b of buckets) map.set(b.slug, b.color_palette);
    return (slug: string | null): [string, string, string] => {
      if (!slug) return FALLBACK_PALETTE;
      return map.get(slug) ?? FALLBACK_PALETTE;
    };
  }, [buckets]);

  // Ground plane sized to comfortably contain the grid plus margin.
  const groundSize = useMemo(() => {
    const extent = artists.reduce((max, a) => {
      const r = Math.max(Math.abs(a.position[0]), Math.abs(a.position[2]));
      return r > max ? r : max;
    }, 0);
    return Math.max(40, (extent + 5) * 2);
  }, [artists]);

  return (
    <>
      <hemisphereLight args={["#dbeafe", "#1f2937", 0.55]} />
      <directionalLight
        position={[20, 30, 15]}
        intensity={1.1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <ambientLight intensity={0.25} />

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
        onPointerMissed={() => onSelect(null)}
      >
        <planeGeometry args={[groundSize, groundSize]} />
        <meshStandardMaterial color="#27272a" roughness={1} metalness={0} />
      </mesh>

      {artists.map((a) => (
        <VoxelBuilding
          key={a.spotify_id}
          height={TIER_HEIGHT[a.tier]}
          palette={paletteForBucket(a.primary_genre_bucket)}
          position={a.position}
          hovered={hoveredId === a.spotify_id}
          selected={selectedId === a.spotify_id}
          onPointerOver={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            onHover(a.spotify_id);
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            onHover(null);
            document.body.style.cursor = "auto";
          }}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            onSelect(a.spotify_id);
          }}
        />
      ))}

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        minDistance={5}
        maxDistance={120}
        // Stop just short of horizontal so the camera can't dip under the plane.
        maxPolarAngle={Math.PI / 2 - 0.05}
        target={[0, 2, 0]}
      />
    </>
  );
}
