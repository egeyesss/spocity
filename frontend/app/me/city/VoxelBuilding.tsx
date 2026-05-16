"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { MeshStandardMaterial } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { VOXEL_SIZE, TIER_HEIGHT } from "./constants";
import { lookupBuildingDef, type SpriteDef, type VoxelDef } from "./buildingDefs";
import { buildVoxelMesh } from "./voxelMesh";
import "./voxelMaterial"; // registers <voxelMaterial> via extend()
import type { Tier } from "./types";

type VoxelMat = THREE.ShaderMaterial & { uEmissiveIntensity: number };

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

// Soft radial blob — the contact shadow under every building. The reference
// designs ground each building with a soft shadow + a faint lot tile rather
// than a hard projected shadow, so we fake it with one shared texture.
let _shadowTex: THREE.CanvasTexture | null = null;
function shadowTexture(): THREE.CanvasTexture | null {
  if (_shadowTex) return _shadowTex;
  if (typeof document === "undefined") return null;
  const s = 128;
  const cvs = document.createElement("canvas");
  cvs.width = cvs.height = s;
  const ctx = cvs.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(0,0,0,0.50)");
  g.addColorStop(0.55, "rgba(0,0,0,0.28)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  _shadowTex = new THREE.CanvasTexture(cvs);
  _shadowTex.colorSpace = THREE.SRGBColorSpace;
  return _shadowTex;
}

// Faint neutral lot tile (slightly darker than the cream ground) so each
// building reads as sitting on its own plot, like the reference renders.
const PAD_COLOR = "#D8CFB8";

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

  // Voxel list: from the design library, or a fallback gradient column for
  // districts/tiers without a hand-authored building.
  const voxels = useMemo<VoxelDef[]>(() => {
    if (buildingDef) return buildingDef.voxels;
    const h = TIER_HEIGHT[tier] ?? 1;
    const third = Math.max(1, Math.ceil(h / 3));
    return Array.from({ length: h }, (_, i) => {
      const band = Math.min(2, Math.floor(i / third));
      const colorIdx = (2 - band) as 0 | 1 | 2;
      return { x: 0, y: 0, z: i, color: palette[colorIdx] };
    });
  }, [buildingDef, tier, palette]);

  // One merged, face-culled, flat-shaded geometry per building.
  const { geometry, footprint, cx, cy } = useMemo(
    () => buildVoxelMesh(voxels),
    [voxels],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  const materialRef = useRef<VoxelMat | null>(null);

  // Only antenna sprites are rendered in R3F (others are 2D-only design notes).
  const antennas = useMemo(
    () =>
      (buildingDef?.sprites ?? []).filter(
        (s): s is SpriteDef & { type: "antenna" } => s.type === "antenna",
      ),
    [buildingDef],
  );

  const antennaTipRefs = useRef<(MeshStandardMaterial | null)[]>([]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    // Body glow: a soft breathing pulse when now-playing, a steady lift when
    // selected, a faint hint on hover, nothing otherwise.
    const mat = materialRef.current;
    if (mat) {
      mat.uEmissiveIntensity = nowPlaying
        ? 0.22 + 0.16 * Math.sin(t * 3)
        : selected
          ? 0.3
          : hovered
            ? 0.12
            : 0;
    }

    // Antenna tips always glow — brighter pulse when now-playing.
    const tipIntensity = nowPlaying ? 2.0 + 0.8 * Math.sin(t * 3) : 1.2;
    for (const mat of antennaTipRefs.current) {
      if (mat) mat.emissiveIntensity = tipIntensity;
    }
  });

  const sTex = shadowTexture();
  const padW = footprint.spanX + 0.7;
  const padD = footprint.spanZ + 0.7;

  return (
    <group
      position={position}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={onClick}
    >
      {/* Faint lot tile */}
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <boxGeometry args={[padW, 0.1, padD]} />
        <meshStandardMaterial color={PAD_COLOR} roughness={1} metalness={0} />
      </mesh>

      {/* Soft contact shadow, just above the pad */}
      {sTex && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
          <planeGeometry args={[padW * 1.5, padD * 1.5]} />
          <meshBasicMaterial
            map={sTex}
            transparent
            depthWrite={false}
            opacity={0.7}
          />
        </mesh>
      )}

      {/* The building itself: one flat-shaded merged mesh */}
      <mesh geometry={geometry}>
        <voxelMaterial
          ref={materialRef}
          attach="material"
          side={THREE.DoubleSide}
        />
      </mesh>

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
            {/* colored point light for the "city at dusk" glow on nearby surfaces */}
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
