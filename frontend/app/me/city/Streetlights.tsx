"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { Road } from "./grid";

// Warm streetlights along every road — the small repeating light source that
// sells "city at dusk". No real point lights: each lamp is a dark pole + an
// unlit warm bulb, plus an additive radial "light pool" quad on the asphalt.
// Everything is merged into three draw calls total (poles, bulbs, pools), and
// placement is deterministic (regular spacing, alternating sides).

const SPACING = 26; // distance between lamps along a road
const EDGE_INSET = 1.1; // pole distance in from the road edge
const CLEAR_CROSSING = 7; // no lamps this close to an intersection
const POLE_H = 3.0;
const ARM_LEN = 1.1;

const POLE_COLOR = "#14110e";
const BULB_COLOR = "#ffd9a0";

interface Lamp {
  x: number; // pole position
  z: number;
  dirX: number; // unit vector pointing across the road (arm direction)
  dirZ: number;
}

function placeLamps(roads: Road[]): Lamp[] {
  const xLanes = roads.filter((r) => r.axis === "z").map((r) => r.lane);
  const zLanes = roads.filter((r) => r.axis === "x").map((r) => r.lane);

  const lamps: Lamp[] = [];
  for (const road of roads) {
    const crossings = road.axis === "z" ? zLanes : xLanes;
    const len = road.to - road.from;
    const count = Math.floor((len - SPACING / 2) / SPACING);
    for (let i = 0; i <= count; i++) {
      const along = road.from + SPACING / 2 + i * SPACING;
      if (along > road.to - 4) break;
      if (crossings.some((c) => Math.abs(along - c) < CLEAR_CROSSING)) continue;

      const side = i % 2 === 0 ? 1 : -1;
      const off = side * (road.width / 2 - EDGE_INSET);
      if (road.axis === "z") {
        lamps.push({ x: road.lane + off, z: along, dirX: -side, dirZ: 0 });
      } else {
        lamps.push({ x: along, z: road.lane + off, dirX: 0, dirZ: -side });
      }
    }
  }
  return lamps;
}

// Merge one box per lamp part into a single geometry (no per-lamp meshes).
function mergedBoxes(
  lamps: Lamp[],
  boxFor: (l: Lamp) => { cx: number; cy: number; cz: number; sx: number; sy: number; sz: number },
): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const l of lamps) {
    const { cx, cy, cz, sx, sy, sz } = boxFor(l);
    const x0 = cx - sx / 2, x1 = cx + sx / 2;
    const y0 = cy - sy / 2, y1 = cy + sy / 2;
    const z0 = cz - sz / 2, z1 = cz + sz / 2;
    // 6 faces × 2 triangles, corners picked per face.
    const quads: [number, number, number][][] = [
      [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], // top
      [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]], // bottom
      [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], // +x
      [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]], // -x
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], // +z
      [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], // -z
    ];
    for (const [a, b, c, d] of quads) {
      for (const p of [a, b, c, a, c, d]) positions.push(...p);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeBoundingSphere();
  return geo;
}

// All light pools in one geometry: a UV-mapped quad under each bulb, sharing
// one radial-gradient texture, additive so they brighten the asphalt.
function mergedPools(lamps: Lamp[], size: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const h = size / 2;
  for (const l of lamps) {
    const bx = l.x + l.dirX * ARM_LEN;
    const bz = l.z + l.dirZ * ARM_LEN;
    const y = 0.09;
    const corners: [number, number, number][] = [
      [bx - h, y, bz - h],
      [bx - h, y, bz + h],
      [bx + h, y, bz + h],
      [bx + h, y, bz - h],
    ];
    const uv: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 0]];
    for (const idx of [0, 1, 2, 0, 2, 3]) {
      positions.push(...corners[idx]);
      uvs.push(...uv[idx]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeBoundingSphere();
  return geo;
}

// Radial warm gradient shared by every light pool. Same module-level lazy
// singleton pattern as VoxelBuilding's contact-shadow texture (safe during
// render — no state, no refs).
let _poolTex: THREE.CanvasTexture | null = null;
function poolTexture(): THREE.CanvasTexture | null {
  if (_poolTex) return _poolTex;
  if (typeof document === "undefined") return null;
  const s = 128;
  const cvs = document.createElement("canvas");
  cvs.width = cvs.height = s;
  const ctx = cvs.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255, 196, 120, 0.7)");
  g.addColorStop(0.4, "rgba(255, 176, 100, 0.28)");
  g.addColorStop(1, "rgba(255, 160, 90, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  _poolTex = new THREE.CanvasTexture(cvs);
  _poolTex.colorSpace = THREE.SRGBColorSpace;
  return _poolTex;
}

export function Streetlights({ roads }: { roads: Road[] }) {
  const lamps = useMemo(() => placeLamps(roads), [roads]);

  const poles = useMemo(
    () =>
      mergedBoxes(lamps, (l) => ({
        cx: l.x,
        cy: POLE_H / 2,
        cz: l.z,
        sx: 0.12,
        sy: POLE_H,
        sz: 0.12,
      })),
    [lamps],
  );
  const arms = useMemo(
    () =>
      mergedBoxes(lamps, (l) => ({
        cx: l.x + (l.dirX * ARM_LEN) / 2,
        cy: POLE_H - 0.05,
        cz: l.z + (l.dirZ * ARM_LEN) / 2,
        sx: l.dirX !== 0 ? ARM_LEN : 0.1,
        sy: 0.1,
        sz: l.dirZ !== 0 ? ARM_LEN : 0.1,
      })),
    [lamps],
  );
  const bulbs = useMemo(
    () =>
      mergedBoxes(lamps, (l) => ({
        cx: l.x + l.dirX * ARM_LEN,
        cy: POLE_H - 0.16,
        cz: l.z + l.dirZ * ARM_LEN,
        sx: 0.3,
        sy: 0.22,
        sz: 0.3,
      })),
    [lamps],
  );
  const pools = useMemo(() => mergedPools(lamps, 5.5), [lamps]);

  useEffect(
    () => () => {
      poles.dispose();
      arms.dispose();
      bulbs.dispose();
      pools.dispose();
    },
    [poles, arms, bulbs, pools],
  );

  const poolTex = poolTexture();

  if (lamps.length === 0) return null;

  return (
    <group>
      <mesh geometry={poles}>
        <meshBasicMaterial color={POLE_COLOR} />
      </mesh>
      <mesh geometry={arms}>
        <meshBasicMaterial color={POLE_COLOR} />
      </mesh>
      <mesh geometry={bulbs}>
        <meshBasicMaterial color={BULB_COLOR} toneMapped={false} />
      </mesh>
      {poolTex && (
        <mesh geometry={pools}>
          <meshBasicMaterial
            map={poolTex}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}
    </group>
  );
}
