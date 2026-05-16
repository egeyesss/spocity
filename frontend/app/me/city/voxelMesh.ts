// Voxel → single merged geometry, with the design's flat 3-tone isometric
// face shading baked straight into per-vertex colors.
//
// Why bake the shading instead of lighting it: the reference designs
// (building-concepts.jsx / district PNGs) are crisp pixel-art isometric
// renders where every cube face is ONE flat color — top brightest, the two
// visible sides at fixed darker steps. PBR lighting can't reproduce that look
// (it softens + washes colors with the sky tint). So we shade per face by a
// constant factor and render the result unlit. It stays identical at any
// camera angle, exactly like the SVG reference.
//
// Two passes of "free" optimisation come along for the ride:
//   • interior-face culling — a face shared with a neighbour voxel is never
//     visible, so it's never emitted.
//   • one merged BufferGeometry per building instead of one mesh per voxel.

import * as THREE from "three";
import type { VoxelDef } from "./buildingDefs";
import { VOXEL_SIZE as S } from "./constants";

// Per-face brightness multipliers (applied in linear space). Matches the
// 3-tone read of the reference art: lit top, mid "front", dark "side".
const FACE_SHADE = {
  top: 1.0,
  bottom: 0.32,
  front: 0.82, // ±Z (world depth) — the lighter pair
  side: 0.66, // ±X — the darker pair
} as const;

// Coordinate convention (kept from buildingDefs.ts):
//   world X = (def.x - cx) * S
//   world Y =  def.z * S + S/2     (def.z is up; z=0 voxel sits on the ground)
//   world Z = (def.y - cy) * S
//
// Each face stores: the local corner offsets (cube centred at origin, edge S),
// its shade key, and the def-space neighbour direction used for culling.
type Face = {
  shade: keyof typeof FACE_SHADE;
  // neighbour offset in def space (dx, dy, dz)
  nx: number;
  ny: number;
  nz: number;
  corners: readonly [number, number, number][];
};

const h = S / 2;

const FACES: readonly Face[] = [
  // world +X  → def (x+1, y, z)
  {
    shade: "side",
    nx: 1, ny: 0, nz: 0,
    corners: [[h, -h, -h], [h, h, -h], [h, h, h], [h, -h, h]],
  },
  // world -X  → def (x-1, y, z)
  {
    shade: "side",
    nx: -1, ny: 0, nz: 0,
    corners: [[-h, -h, h], [-h, h, h], [-h, h, -h], [-h, -h, -h]],
  },
  // world +Y (top) → def (x, y, z+1)
  {
    shade: "top",
    nx: 0, ny: 0, nz: 1,
    corners: [[-h, h, -h], [-h, h, h], [h, h, h], [h, h, -h]],
  },
  // world -Y (bottom) → def (x, y, z-1)
  {
    shade: "bottom",
    nx: 0, ny: 0, nz: -1,
    corners: [[-h, -h, h], [-h, -h, -h], [h, -h, -h], [h, -h, h]],
  },
  // world +Z → def (x, y+1, z)
  {
    shade: "front",
    nx: 0, ny: 1, nz: 0,
    corners: [[-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]],
  },
  // world -Z → def (x, y-1, z)
  {
    shade: "front",
    nx: 0, ny: -1, nz: 0,
    corners: [[h, -h, -h], [-h, -h, -h], [-h, h, -h], [h, h, -h]],
  },
];

export interface VoxelMesh {
  geometry: THREE.BufferGeometry;
  /** World-space footprint, for sizing the lot pad + contact shadow. */
  footprint: { spanX: number; spanZ: number };
  /** World-space height of the tallest voxel's top face. */
  topY: number;
  /** def-space footprint centre, so sprites stay aligned with the body. */
  cx: number;
  cy: number;
}

const _color = new THREE.Color();

/**
 * Build one merged, face-culled, vertex-shaded geometry for a voxel set.
 * Colours are written in linear space (the shader encodes to sRGB on output).
 */
export function buildVoxelMesh(voxels: VoxelDef[]): VoxelMesh {
  const xs = voxels.map((v) => v.x);
  const ys = voxels.map((v) => v.y);
  const zs = voxels.map((v) => v.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const maxZ = Math.max(...zs);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  // Occupancy set for O(1) neighbour lookups during face culling.
  const occupied = new Set<string>();
  for (const v of voxels) occupied.add(`${v.x},${v.y},${v.z}`);

  const positions: number[] = [];
  const colors: number[] = [];

  for (const v of voxels) {
    // World-space centre of this voxel.
    const ox = (v.x - cx) * S;
    const oy = v.z * S + S / 2;
    const oz = (v.y - cy) * S;

    _color.set(v.color); // hex (sRGB) → linear working space
    const lr = _color.r;
    const lg = _color.g;
    const lb = _color.b;

    for (const f of FACES) {
      // Skip any face shared with a neighbour voxel — it can never be seen.
      if (occupied.has(`${v.x + f.nx},${v.y + f.ny},${v.z + f.nz}`)) continue;

      const k = FACE_SHADE[f.shade];
      const cr = lr * k;
      const cg = lg * k;
      const cb = lb * k;

      const [a, b, c, d] = f.corners;
      // Two triangles (a,b,c) (a,c,d). Material is DoubleSide so winding
      // doesn't matter — exteriors are closed and unlit.
      for (const [px, py, pz] of [a, b, c, a, c, d]) {
        positions.push(ox + px, oy + py, oz + pz);
        colors.push(cr, cg, cb);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute(
    "aColor",
    new THREE.Float32BufferAttribute(colors, 3),
  );
  geometry.computeBoundingSphere();

  return {
    geometry,
    footprint: {
      spanX: (maxX - minX + 1) * S,
      spanZ: (maxY - minY + 1) * S,
    },
    topY: (maxZ + 1) * S,
    cx,
    cy,
  };
}
