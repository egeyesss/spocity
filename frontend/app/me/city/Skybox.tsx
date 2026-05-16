"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

// Dusk gradient skydome. A big inward-facing sphere with the gradient baked
// into per-vertex colors and an unlit `meshBasicMaterial` (basic material
// handles colour management correctly, so no custom shader needed).
//
// The dome is locked to the camera position every frame (translate only — no
// rotation), so:
//   • it always fully surrounds the view (a world-centred dome gets its far
//     side clipped by the camera far plane once you orbit away from origin —
//     that's the "finite black ball" bug),
//   • every point stays exactly RADIUS from the camera, well inside the far
//     plane, so it never clips,
//   • the gradient stays world-vertical (translation doesn't rotate it), so
//     its horizon band keeps lining up with the real horizon + the fog.
//
// SKY_HORIZON is exported so the scene can match the fog colour to it; the
// ground then dissolves into the sky instead of ending in a seam.
export const SKY_TOP = "#0b0913"; // near-black indigo overhead
export const SKY_HORIZON = "#3a2f44"; // muted dusk mauve at the horizon
const SKY_GLOW = "#5a4654"; // faint warmth right on the horizon line

const RADIUS = 450; // < camera far (600); camera-locked so this is exact

export function Skybox() {
  const ref = useRef<THREE.Mesh>(null);

  const geometry = useMemo(() => {
    const geo = new THREE.SphereGeometry(RADIUS, 32, 24);
    const top = new THREE.Color(SKY_TOP);
    const horizon = new THREE.Color(SKY_HORIZON);
    const glow = new THREE.Color(SKY_GLOW);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      // Normalised height of this vertex on the dome, -1 (down) … 1 (up).
      const y = pos.getY(i) / RADIUS;
      if (y >= 0) {
        // Above the horizon: warm band → deep indigo overhead.
        const t = THREE.MathUtils.smoothstep(y, 0.0, 0.55);
        c.copy(glow).lerp(horizon, THREE.MathUtils.smoothstep(y, 0.0, 0.12));
        c.lerp(top, t);
      } else {
        // Below the horizon (mostly hidden by ground): settle to horizon.
        c.copy(horizon).lerp(top, THREE.MathUtils.smoothstep(-y, 0.0, 0.4) * 0.5);
      }
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }, []);

  useFrame(({ camera }) => {
    const m = ref.current;
    if (m) m.position.copy(camera.position);
  });

  return (
    <mesh
      ref={ref}
      geometry={geometry}
      renderOrder={-1000}
      frustumCulled={false}
    >
      <meshBasicMaterial
        vertexColors
        side={THREE.BackSide}
        depthWrite={false}
        depthTest={false}
        fog={false}
        toneMapped={false}
      />
    </mesh>
  );
}
