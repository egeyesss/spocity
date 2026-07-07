"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { FACE_SHADE } from "./voxelMesh";
import "./voxelMaterial"; // registers <voxelMaterial>

// Procedural "rest of the city" around the real districts: rings of small,
// dim, neutral filler buildings that thin with distance and fade toward the
// horizon colour so they melt into the dusk fog. They frame the user's city
// as a downtown core without competing with the vivid genre blocks — they're
// short, desaturated, and non-interactive. One merged geometry, one draw call.

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 5 visible faces of a world-space box (bottom skipped — never seen). Each:
// shade key + 4 CCW corners as [x,y,z] picked from (x0|x1, y0|y1, z0|z1).
type BoxFace = {
  shade: keyof typeof FACE_SHADE;
  pick: readonly [number, number, number][];
};
// indices into [x0,x1,y0,y1,z0,z1]
const BOX_FACES: readonly BoxFace[] = [
  { shade: "top", pick: [[0, 3, 4], [0, 3, 5], [1, 3, 5], [1, 3, 4]] },
  { shade: "side", pick: [[1, 2, 4], [1, 3, 4], [1, 3, 5], [1, 2, 5]] }, // +X
  { shade: "side", pick: [[0, 2, 5], [0, 3, 5], [0, 3, 4], [0, 2, 4]] }, // -X
  { shade: "front", pick: [[0, 2, 5], [1, 2, 5], [1, 3, 5], [0, 3, 5]] }, // +Z
  { shade: "front", pick: [[1, 2, 4], [0, 2, 4], [0, 3, 4], [1, 3, 4]] }, // -Z
];

interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const NEUTRALS = ["#2e2a36", "#39333f", "#443c47", "#322d3a", "#23202b"];

function buildOutskirts(rect: Rect, horizonHex: string): THREE.BufferGeometry {
  const cx = (rect.x0 + rect.x1) / 2;
  const cz = (rect.z0 + rect.z1) / 2;
  const cityHalf = Math.max((rect.x1 - rect.x0) / 2, (rect.z1 - rect.z0) / 2);
  const edge = cityHalf + 6; // keep clear of the perimeter road
  // Reach out to roughly where the fog completes (CityScene uses
  // far ≈ cityHalf*3.4) so the apron fills instead of leaving a bare ring.
  const depth = Math.max(170, cityHalf * 2.6);
  const Rout = edge + depth;

  const rng = mulberry32(0x5e0c17a9);
  const horizon = new THREE.Color(horizonHex);
  const palette = NEUTRALS.map((h) => new THREE.Color(h));

  const positions: number[] = [];
  const colors: number[] = [];
  const tmp = new THREE.Color();
  const CELL = 13;

  for (let gx = -Rout; gx <= Rout; gx += CELL) {
    for (let gz = -Rout; gz <= Rout; gz += CELL) {
      const px = cx + gx + (rng() - 0.5) * CELL * 0.6;
      const pz = cz + gz + (rng() - 0.5) * CELL * 0.6;

      // Don't overlap the real city / its ring road.
      if (
        px > rect.x0 - 4 &&
        px < rect.x1 + 4 &&
        pz > rect.z0 - 4 &&
        pz < rect.z1 + 4
      )
        continue;

      const d = Math.hypot(px - cx, pz - cz);
      if (d <= edge) continue;
      const t = (d - edge) / (Rout - edge);
      if (t < 0 || t > 1) continue;

      // Denser near the city, sparse toward the horizon.
      const place = Math.pow(1 - t, 1.3) * 0.75 + 0.04;
      if (rng() > place) continue;

      const fw = 2 + Math.floor(rng() * (t < 0.5 ? 3 : 2));
      const fd = 2 + Math.floor(rng() * (t < 0.5 ? 3 : 2));
      const hMax = Math.max(1, Math.round((1 - t) * 6)); // cap 6 — towers still win
      const H = 1 + Math.floor(rng() * hMax);

      const base = palette[Math.floor(rng() * palette.length)].clone();
      // Fade toward the horizon colour with distance so far ones disappear
      // into the dusk fog instead of forming a hard ring.
      const fade = THREE.MathUtils.smoothstep(t, 0.1, 1.0) * 0.92;
      base.lerp(horizon, fade);

      const b = [px - fw / 2, px + fw / 2, 0, H, pz - fd / 2, pz + fd / 2];
      for (const f of BOX_FACES) {
        const k = FACE_SHADE[f.shade];
        tmp.copy(base).multiplyScalar(k);
        const [c0, c1, c2, c3] = f.pick;
        const tri = [c0, c1, c2, c0, c2, c3];
        for (const [xi, yi, zi] of tri) {
          positions.push(b[xi], b[yi], b[zi]);
          colors.push(tmp.r, tmp.g, tmp.b);
        }
      }

      // Sparse lit windows on the nearer, taller boxes — small warm quads
      // floated just off a wall. They fade with distance like the walls do,
      // so the ring reads as an inhabited city melting into the dusk.
      if (H >= 2 && t < 0.65 && rng() < 0.55) {
        const nWin = 1 + Math.floor(rng() * 2);
        for (let w = 0; w < nWin; w++) {
          const face = Math.floor(rng() * 4);
          const wy = 0.5 + rng() * (H - 1.1);
          const hw = 0.26; // half width
          const hh = 0.32; // half height
          tmp.set("#ffc97a").lerp(horizon, fade * 0.85);

          let quad: [number, number, number][];
          if (face === 0 || face === 1) {
            const x = face === 0 ? b[1] + 0.03 : b[0] - 0.03;
            const wz = b[4] + 0.5 + rng() * (b[5] - b[4] - 1);
            quad = [
              [x, wy - hh, wz - hw],
              [x, wy + hh, wz - hw],
              [x, wy + hh, wz + hw],
              [x, wy - hh, wz + hw],
            ];
          } else {
            const z = face === 2 ? b[5] + 0.03 : b[4] - 0.03;
            const wx = b[0] + 0.5 + rng() * (b[1] - b[0] - 1);
            quad = [
              [wx - hw, wy - hh, z],
              [wx - hw, wy + hh, z],
              [wx + hw, wy + hh, z],
              [wx + hw, wy - hh, z],
            ];
          }
          const [q0, q1, q2, q3] = quad;
          for (const p of [q0, q1, q2, q0, q2, q3]) {
            positions.push(...p);
            colors.push(tmp.r, tmp.g, tmp.b);
          }
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("aColor", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeBoundingSphere();
  return geo;
}

export function Outskirts({
  bounds,
  horizon,
}: {
  bounds: Rect;
  horizon: string;
}) {
  const geometry = useMemo(
    () => buildOutskirts(bounds, horizon),
    [bounds, horizon],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <voxelMaterial attach="material" side={THREE.DoubleSide} />
    </mesh>
  );
}
