"use client";

import { OrbitControls, Text } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useMemo } from "react";
import { FALLBACK_PALETTE, TIER_HEIGHT } from "./constants";
import { bucketCenters } from "./grid";
import type { BucketRow, PlacedArtist } from "./types";
import { VoxelBuilding } from "./VoxelBuilding";

interface CitySceneProps {
  artists: PlacedArtist[];
  buckets: BucketRow[];
  hoveredId: string | null;
  selectedId: string | null;
  nowPlayingId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
}

/**
 * Everything that lives inside <Canvas>. Lights, ground, OrbitControls,
 * district labels, and buildings. Pure 3D — no DOM.
 */
export function CityScene({
  artists,
  buckets,
  hoveredId,
  selectedId,
  nowPlayingId,
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

  // District labels: one per occupied bucket, positioned just outside the
  // district's center anchor so the label doesn't overlap the tallest building.
  const districtLabels = useMemo(() => {
    const centers = bucketCenters(buckets);
    const bucketMap = new Map(buckets.map((b) => [b.slug, b]));

    // Collect occupied slugs from placed artists.
    const occupied = new Set<string>();
    for (const a of artists) {
      if (a.primary_genre_bucket) occupied.add(a.primary_genre_bucket);
    }

    const labels: {
      slug: string;
      label: string;
      cx: number;
      cz: number;
      color: string;
    }[] = [];
    for (const slug of occupied) {
      const center = centers.get(slug);
      const bucket = bucketMap.get(slug);
      if (!center || !bucket) continue;
      labels.push({
        slug,
        label: bucket.label,
        cx: center[0],
        cz: center[1],
        color: bucket.color_palette[0], // lightest stop for readability on dark bg
      });
    }
    return labels;
  }, [artists, buckets]);

  const groundSize = useMemo(() => {
    const extent = artists.reduce((max, a) => {
      const r = Math.max(Math.abs(a.position[0]), Math.abs(a.position[2]));
      return r > max ? r : max;
    }, 0);
    return Math.max(80, (extent + 15) * 2);
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

      {districtLabels.map(({ slug, label, cx, cz, color }) => (
        // Label floats 2 units in front of (negative Z from) the district center,
        // low enough to read but above ground-level clutter.
        <Text
          key={slug}
          position={[cx, 1.2, cz + 13]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={2.2}
          color={color}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.08}
          outlineColor="#0a0a0a"
        >
          {label}
        </Text>
      ))}

      {artists.map((a) => (
        <VoxelBuilding
          key={a.spotify_id}
          height={TIER_HEIGHT[a.tier]}
          palette={paletteForBucket(a.primary_genre_bucket)}
          position={a.position}
          hovered={hoveredId === a.spotify_id}
          selected={selectedId === a.spotify_id}
          nowPlaying={nowPlayingId === a.spotify_id}
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
        maxDistance={200}
        maxPolarAngle={Math.PI / 2 - 0.05}
        target={[0, 2, 0]}
      />
    </>
  );
}
