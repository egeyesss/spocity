"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { MeshStandardMaterial } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { VOXEL_SIZE, TIER_HEIGHT } from "./constants";
import { lookupBuildingDef, type SpriteDef } from "./buildingDefs";
import type { Tier } from "./types";

interface VoxelBuildingProps {
  district: string | null;
  tier: Tier;
  palette: [string, string, string]; // fallback for districts without a building def
  position: [number, number, number];
  hovered?: boolean;
  selected?: boolean;
  nowPlaying?: boolean;
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}

export function VoxelBuilding({
  district,
  tier,
  palette,
  position,
  hovered = false,
  selected = false,
  nowPlaying = false,
  onPointerOver,
  onPointerOut,
  onClick,
}: VoxelBuildingProps) {
  const buildingDef = useMemo(() => lookupBuildingDef(district, tier), [district, tier]);

  // Voxel list + footprint center for coordinate translation
  const { voxels, cx, cy } = useMemo(() => {
    if (buildingDef) {
      const dv = buildingDef.voxels;
      const xs = dv.map((v) => v.x);
      const ys = dv.map((v) => v.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      return { voxels: dv, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
    }
    // Fallback: height-band gradient column
    const h = TIER_HEIGHT[tier] ?? 1;
    const third = Math.max(1, Math.ceil(h / 3));
    return {
      voxels: Array.from({ length: h }, (_, i) => {
        const band = Math.min(2, Math.floor(i / third));
        const colorIdx = (2 - band) as 0 | 1 | 2;
        return { x: 0, y: 0, z: i, color: palette[colorIdx] };
      }),
      cx: 0,
      cy: 0,
    };
  }, [buildingDef, tier, palette]);

  // Only antenna sprites are rendered in R3F (others are 2D-only design elements)
  const antennas = useMemo(
    () =>
      (buildingDef?.sprites ?? []).filter(
        (s): s is SpriteDef & { type: "antenna" } => s.type === "antenna",
      ),
    [buildingDef],
  );

  const matRefs = useRef<(MeshStandardMaterial | null)[]>([]);
  const antennaTipRefs = useRef<(MeshStandardMaterial | null)[]>([]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const bodyIntensity = nowPlaying
      ? 0.3 + 0.25 * Math.sin(t * 3)
      : selected
        ? 0.45
        : hovered
          ? 0.15
          : 0;
    for (const mat of matRefs.current) {
      if (mat) mat.emissiveIntensity = bodyIntensity;
    }
    // Antenna tips always glow — brighter pulse when now-playing
    const tipIntensity = nowPlaying ? 2.0 + 0.8 * Math.sin(t * 3) : 1.2;
    for (const mat of antennaTipRefs.current) {
      if (mat) mat.emissiveIntensity = tipIntensity;
    }
  });

  return (
    <group
      position={position}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={onClick}
    >
      {/* Per-voxel body meshes */}
      {voxels.map((v, i) => (
        <mesh
          key={i}
          position={[
            (v.x - cx) * VOXEL_SIZE,
            v.z * VOXEL_SIZE + VOXEL_SIZE / 2,
            (v.y - cy) * VOXEL_SIZE,
          ]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE]} />
          <meshStandardMaterial
            ref={(mat) => {
              matRefs.current[i] = mat;
            }}
            color={v.color}
            emissive={v.color}
            emissiveIntensity={0}
            roughness={0.75}
            metalness={0.05}
          />
        </mesh>
      ))}

      {/* Antenna sprites: thin pole + glowing emissive tip + point light */}
      {antennas.map((s, ai) => {
        const ax = (s.x - cx) * VOXEL_SIZE;
        const az = (s.y - cy) * VOXEL_SIZE;
        const poleH = (s.h ?? 6) * 0.25;
        const baseY = s.z * VOXEL_SIZE;
        const tipColor = s.tipColor ?? "#EF4444";
        return (
          <group key={`ant-${ai}`}>
            {/* pole */}
            <mesh position={[ax, baseY + poleH / 2, az]}>
              <boxGeometry args={[0.08, poleH, 0.08]} />
              <meshStandardMaterial color={s.color ?? "#1a1a1a"} roughness={1} />
            </mesh>
            {/* glowing tip sphere */}
            <mesh position={[ax, baseY + poleH, az]}>
              <sphereGeometry args={[0.18, 8, 8]} />
              <meshStandardMaterial
                ref={(mat) => {
                  antennaTipRefs.current[ai] = mat;
                }}
                color={tipColor}
                emissive={tipColor}
                emissiveIntensity={1.2}
                roughness={0.1}
              />
            </mesh>
            {/* colored point light for the "city at night" glow on nearby surfaces */}
            <pointLight
              position={[ax, baseY + poleH, az]}
              color={tipColor}
              intensity={0.5}
              distance={8}
              decay={2}
            />
          </group>
        );
      })}
    </group>
  );
}
