"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { MeshStandardMaterial } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { VOXEL_SIZE } from "./constants";

interface VoxelBuildingProps {
  height: number;
  palette: [string, string, string]; // [light, mid, dark]
  position: [number, number, number];
  hovered?: boolean;
  selected?: boolean;
  nowPlaying?: boolean;
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}

/**
 * One building, rendered as a vertical stack of unit cubes.
 *
 * Bottom third uses the darkest palette stop, middle third the mid, top third
 * the lightest — gives a "light catches the top" feel without per-voxel lighting.
 *
 * nowPlaying triggers a sin-wave emissive pulse via useFrame, mutating the
 * Three.js material refs directly so no React re-renders are needed per frame.
 */
export function VoxelBuilding({
  height,
  palette,
  position,
  hovered = false,
  selected = false,
  nowPlaying = false,
  onPointerOver,
  onPointerOut,
  onClick,
}: VoxelBuildingProps) {
  const voxels = useMemo(() => {
    const third = Math.max(1, Math.ceil(height / 3));
    return Array.from({ length: height }, (_, i) => {
      const band = Math.min(2, Math.floor(i / third));
      // band 0 = bottom (dark), band 1 = mid, band 2 = top (light)
      const colorIdx = (2 - band) as 0 | 1 | 2;
      return { y: i * VOXEL_SIZE + VOXEL_SIZE / 2, color: palette[colorIdx] };
    });
  }, [height, palette]);

  // Collect refs to every voxel material so useFrame can mutate them imperatively.
  const matRefs = useRef<(MeshStandardMaterial | null)[]>([]);

  useFrame(({ clock }) => {
    const intensity = nowPlaying
      ? 0.45 + 0.4 * Math.sin(clock.elapsedTime * 3)
      : selected
        ? 0.55
        : hovered
          ? 0.25
          : 0;
    for (const mat of matRefs.current) {
      if (mat) mat.emissiveIntensity = intensity;
    }
  });

  return (
    <group
      position={position}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={onClick}
    >
      {voxels.map((v, i) => (
        <mesh key={i} position={[0, v.y, 0]} castShadow receiveShadow>
          <boxGeometry args={[VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE]} />
          <meshStandardMaterial
            ref={(mat) => {
              matRefs.current[i] = mat;
            }}
            color={v.color}
            emissive={v.color}
            emissiveIntensity={nowPlaying ? 0.45 : selected ? 0.55 : hovered ? 0.25 : 0}
            roughness={0.7}
            metalness={0.05}
          />
        </mesh>
      ))}
    </group>
  );
}
