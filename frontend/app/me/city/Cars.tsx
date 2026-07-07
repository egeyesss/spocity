"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Group, MeshBasicMaterial, MeshStandardMaterial } from "three";
import { ROAD_WIDTH } from "./constants";
import type { Road } from "./grid";
import { ISLAND_R } from "./StreetFurniture";

const CAR_COLORS = [
  "#E5E7EB", // silver
  "#DC2626", // red
  "#1F2937", // charcoal
  "#F59E0B", // amber
  "#0EA5E9", // sky
  "#10B981", // green
  "#FAFAF5", // white
  "#7C3AED", // violet
];

// How far from an intersection a car starts easing outward, and how far off
// the centerline it must be to clear the island + curb.
const SWERVE_RADIUS = ROAD_WIDTH * 0.62;
const CLEAR = ISLAND_R + 1.6;

interface CarState {
  road: number;
  dir: 1 | -1;
  t: number; // progress 0..1 along the road
  speed: number; // world units / second
  color: string;
  laneOff: number; // perpendicular offset from centerline (which side of the road)
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pickColor = () =>
  CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];

function spawn(roads: Road[]): CarState {
  return {
    road: Math.floor(Math.random() * roads.length),
    dir: Math.random() < 0.5 ? 1 : -1,
    t: Math.random(), // staggered so they don't all start together
    speed: rand(7, 15),
    color: pickColor(),
    laneOff: (Math.random() < 0.5 ? -1 : 1) * rand(1.3, 2.6),
  };
}

/**
 * Ambient traffic: small voxel cars drive the length of a road, fading in as
 * they enter and out before they reach the end, then respawn somewhere else.
 * Near an intersection a car eases outward so it arcs *around* the roundabout
 * island instead of driving over it. One useFrame loop mutates Three.js
 * objects directly — no per-frame React re-render.
 */
export function Cars({ roads }: { roads: Road[] }) {
  const count =
    roads.length === 0 ? 0 : Math.min(18, Math.max(6, roads.length * 2));

  // Perpendicular coordinates where roads cross: a car travelling along Z
  // crosses every X-road's lane (and vice versa).
  const { xLanes, zLanes } = useMemo(() => {
    const xs = roads.filter((r) => r.axis === "z").map((r) => r.lane);
    const zs = roads.filter((r) => r.axis === "x").map((r) => r.lane);
    return { xLanes: xs, zLanes: zs };
  }, [roads]);

  // Car state lives in a ref, built in an effect — useFrame mutates it every
  // frame, and the react-hooks lint (correctly) forbids mutating a useMemo
  // value after render.
  const carsRef = useRef<CarState[]>([]);
  useEffect(() => {
    carsRef.current = Array.from({ length: count }, () => spawn(roads));
  }, [roads, count]);

  const groupRefs = useRef<(Group | null)[]>([]);
  const bodyRefs = useRef<(MeshStandardMaterial | null)[]>([]);
  const cabinRefs = useRef<(MeshStandardMaterial | null)[]>([]);
  const headRefs = useRef<(MeshBasicMaterial | null)[]>([]);
  const tailRefs = useRef<(MeshBasicMaterial | null)[]>([]);

  useFrame((_, delta) => {
    const cars = carsRef.current;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      const road = roads[c.road];
      if (!road) continue;

      const span = road.to - road.from;
      const len = Math.max(Math.abs(span), 1);
      c.t += (c.speed * delta) / len;
      if (c.t >= 1) Object.assign(c, spawn(roads), { t: 0 });

      const g = groupRefs.current[i];
      if (!g) continue;

      const along = road.from + (c.dir === 1 ? c.t : 1 - c.t) * span;

      // Distance to the nearest intersection along this road, then ramp the
      // car outward (smoothstep) so it bends around the island.
      const crossings = road.axis === "z" ? zLanes : xLanes;
      let nearest = Infinity;
      for (const cv of crossings) {
        const d = Math.abs(along - cv);
        if (d < nearest) nearest = d;
      }
      const side = Math.sign(c.laneOff) || 1;
      const target = side * Math.max(Math.abs(c.laneOff), CLEAR);
      let f = 0;
      if (nearest < SWERVE_RADIUS) {
        const u = 1 - nearest / SWERVE_RADIUS;
        f = u * u * (3 - 2 * u); // smoothstep
      }
      const perp = c.laneOff + (target - c.laneOff) * f;

      // Face the direction of travel (local +X = forward, for the lights).
      if (road.axis === "z") {
        g.position.set(road.lane + perp, 0.34, along);
        g.rotation.y = c.dir === 1 ? -Math.PI / 2 : Math.PI / 2;
      } else {
        g.position.set(along, 0.34, road.lane + perp);
        g.rotation.y = c.dir === 1 ? 0 : Math.PI;
      }

      // Fade in over the first 10%, hold, fade out over the last 30%.
      const op =
        c.t < 0.1
          ? c.t / 0.1
          : c.t > 0.7
            ? Math.max(0, (1 - c.t) / 0.3)
            : 1;
      const body = bodyRefs.current[i];
      if (body) {
        body.opacity = op;
        body.color.set(c.color);
        body.emissive.set(c.color);
      }
      const cabin = cabinRefs.current[i];
      if (cabin) cabin.opacity = op * 0.9;
      const head = headRefs.current[i];
      if (head) head.opacity = op;
      const tail = tailRefs.current[i];
      if (tail) tail.opacity = op;
    }
  });

  if (count === 0) return null;

  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            groupRefs.current[i] = el;
          }}
        >
          <mesh position={[0, 0.18, 0]}>
            <boxGeometry args={[1.9, 0.36, 0.9]} />
            <meshStandardMaterial
              ref={(el) => {
                bodyRefs.current[i] = el;
              }}
              transparent
              opacity={0}
              roughness={0.5}
              metalness={0.25}
              emissiveIntensity={0.12}
            />
          </mesh>
          <mesh position={[-0.12, 0.46, 0]}>
            <boxGeometry args={[0.95, 0.34, 0.78]} />
            <meshStandardMaterial
              ref={(el) => {
                cabinRefs.current[i] = el;
              }}
              color="#0f172a"
              transparent
              opacity={0}
              roughness={0.25}
              metalness={0.1}
            />
          </mesh>
          {/* Headlights + taillights — unlit so they read at dusk */}
          <mesh position={[0.96, 0.2, 0]}>
            <boxGeometry args={[0.06, 0.13, 0.72]} />
            <meshBasicMaterial
              ref={(el) => {
                headRefs.current[i] = el;
              }}
              color="#fff0c0"
              toneMapped={false}
              transparent
              opacity={0}
            />
          </mesh>
          <mesh position={[-0.96, 0.2, 0]}>
            <boxGeometry args={[0.06, 0.13, 0.72]} />
            <meshBasicMaterial
              ref={(el) => {
                tailRefs.current[i] = el;
              }}
              color="#ff4b4b"
              toneMapped={false}
              transparent
              opacity={0}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}
