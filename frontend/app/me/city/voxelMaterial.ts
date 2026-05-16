// Unlit material for the baked-shading voxel geometry.
//
// The geometry already carries the final per-face colour in linear space
// (see voxelMesh.ts), so this material does almost nothing: pass the vertex
// colour through, add an optional emissive boost (hover / selected /
// now-playing pulse), then encode linear → sRGB for the output buffer.
//
// It is deliberately light-independent: no normals, no lights, no shadows.
// That's what gives the crisp, camera-stable pixel-art look of the reference
// designs. three.js ColorManagement is on, so we do the sRGB OETF ourselves
// rather than rely on the built-in shader chunks (keeps this GLSL-version
// agnostic and self-contained).
//
// Built as a drei `shaderMaterial` + `extend` so it can be used as a normal
// R3F JSX element with a ref — the idiomatic pattern useFrame mutation +
// the react-hooks lint both expect.

import { shaderMaterial } from "@react-three/drei";
import { extend, type ThreeElement } from "@react-three/fiber";
import * as THREE from "three";

const VERT = /* glsl */ `
  attribute vec3 aColor;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform vec3  uEmissive;
  uniform float uEmissiveIntensity;
  varying vec3  vColor;

  // Accurate linear → sRGB transfer function.
  vec3 lin2srgb(vec3 c) {
    c = max(c, 0.0);
    vec3 lo = c * 12.92;
    vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
    return mix(hi, lo, step(c, vec3(0.0031308)));
  }

  void main() {
    vec3 c = vColor + uEmissive * uEmissiveIntensity;
    gl_FragColor = vec4(lin2srgb(c), 1.0);
  }
`;

export const VoxelMaterial = shaderMaterial(
  {
    // Linear-space glow colour; warm white reads well over every palette.
    uEmissive: new THREE.Color(0xffffff).convertSRGBToLinear(),
    uEmissiveIntensity: 0,
  },
  VERT,
  FRAG,
);

extend({ VoxelMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    voxelMaterial: ThreeElement<typeof VoxelMaterial>;
  }
}
