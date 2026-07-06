"use client";

import { Line, OrbitControls, Stars } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useCallback, useMemo, useRef } from "react";
import type { Vector3 } from "three";
import { FALLBACK_PALETTE } from "./constants";
import { CameraRig, makeFocusState, type FocusState } from "./CameraRig";
import { Billboards } from "./Billboards";
import { Cars } from "./Cars";
import { Outskirts } from "./Outskirts";
import { Skybox, SKY_HORIZON, SKY_TOP } from "./Skybox";
import { StreetFurniture } from "./StreetFurniture";
import { Streetlights } from "./Streetlights";
import { shade } from "./buildingDefs";
import { cityRoads } from "./grid";
import type { DistrictBlock, ParkCell } from "./grid";
import type { NowPlayingData } from "@/lib/useNowPlaying";
import type { BucketRow, PlacedArtist } from "./types";
import { VoxelBuilding } from "./VoxelBuilding";

// Dusk ground / street palette (building-visual-design.md tokens). The whole
// ground layer is dark so the buildings' baked colors + glow carry the scene —
// the earlier cream daytime ground fought the dusk sky and washed everything
// into gray.
// The ground layer is unlit (meshBasicMaterial) just like the buildings:
// these are the exact on-screen colors, chosen against the dusk sky. Lights
// only shape the few volumetric props (cars, trees keep a hint of form).
const GROUND = "#262030"; // dark plum ground plane
const ASPHALT = "#3c352c"; // spec `asphalt` — warm dark roads
const ROAD_LINE = "#C9BFA8"; // faint warm lane dashes (drawn at low opacity)
const GRASS = "#2E5133"; // park tile, dusk green

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A few layered voxel trees scattered deterministically inside a park.
function Park({ park, seed }: { park: ParkCell; seed: number }) {
  const w = park.x1 - park.x0;
  const h = park.z1 - park.z0;
  const rnd = mulberry32(seed * 2654435761);
  const n = Math.max(5, Math.min(16, Math.round((w * h) / 130)));
  const trees = Array.from({ length: n }, () => {
    const tx = park.x0 + 2 + rnd() * (w - 4);
    const tz = park.z0 + 2 + rnd() * (h - 4);
    const s = 0.8 + rnd() * 0.6;
    return { tx, tz, s };
  });

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[park.cx, 0.05, park.cz]}
      >
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial
          color={GRASS}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
      {trees.map((t, i) => (
        <group key={i} position={[t.tx, 0, t.tz]} scale={[t.s, t.s, t.s]}>
          <mesh position={[0, 0.55, 0]}>
            <boxGeometry args={[0.34, 1.1, 0.34]} />
            <meshBasicMaterial color="#4a3620" />
          </mesh>
          <mesh position={[0, 1.7, 0]}>
            <boxGeometry args={[1.5, 1.3, 1.5]} />
            <meshBasicMaterial color="#22502c" />
          </mesh>
          <mesh position={[0, 2.5, 0]}>
            <boxGeometry args={[0.95, 0.8, 0.95]} />
            <meshBasicMaterial color="#2d6338" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

interface CitySceneProps {
  artists: PlacedArtist[];
  blocks: DistrictBlock[];
  parks: ParkCell[];
  buckets: BucketRow[];
  hoveredId: string | null;
  selectedId: string | null;
  nowPlayingId: string | null;
  nowPlaying: NowPlayingData | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
}

export function CityScene({
  artists,
  blocks,
  parks,
  buckets,
  hoveredId,
  selectedId,
  nowPlayingId,
  nowPlaying,
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

  const { roads, intersections, bounds } = useMemo(
    () => cityRoads(blocks),
    [blocks],
  );

  // City scale → fog band + ground size. Fog is tinted to the sky's horizon
  // colour and reaches full opacity before the ground edge, so the finite
  // plane dissolves into the dusk sky instead of ending in a hard seam.
  const { groundSize, fogNear, fogFar } = useMemo(() => {
    const artistExtent = artists.reduce((max, a) => {
      const r = Math.max(Math.abs(a.position[0]), Math.abs(a.position[2]));
      return r > max ? r : max;
    }, 0);
    const cityHalf = bounds
      ? Math.max(
          (bounds.x1 - bounds.x0) / 2,
          (bounds.z1 - bounds.z0) / 2,
          artistExtent,
        )
      : Math.max(80, artistExtent);
    const near = cityHalf + 25;
    const far = Math.min(560, cityHalf * 3.4 + 60);
    return {
      groundSize: Math.max(200, far * 2 + 100),
      fogNear: near,
      fogFar: far,
    };
  }, [artists, bounds]);

  // Click-to-focus a billboard: record the destination; CameraRig flies there.
  const focusRef = useRef<FocusState>(makeFocusState());
  const focusOn = useCallback(
    (id: number, target: Vector3, camPos: Vector3) => {
      const f = focusRef.current;
      f.reqId = id;
      f.reqTarget.copy(target);
      f.reqPos.copy(camPos);
      f.requested = true;
    },
    [],
  );

  return (
    <>
      {/* Dusk sky: gradient dome + horizon-tinted fog. Background colour is a
          fallback equal to the dome's top tone. */}
      <color attach="background" args={[SKY_TOP]} />
      <fog attach="fog" args={[SKY_HORIZON, fogNear, fogFar]} />
      <Skybox />

      {/* Dusk lighting for the lit props (ground, roads, trees, cars, pads —
          buildings are unlit and carry their own baked shading). A cool
          indigo hemisphere + one warm low "last light" directional keep the
          ground dark but readable. */}
      <hemisphereLight args={["#584d70", "#241f1a", 0.55]} />
      <directionalLight
        position={[-60, 45, 40]}
        color="#ffb37a"
        intensity={0.35}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <ambientLight intensity={0.22} color="#8a80a8" />

      <Stars radius={300} depth={60} count={900} factor={1.6} saturation={0} fade speed={0} />

      {/* Dark warm base ground */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
        onPointerMissed={() => onSelect(null)}
      >
        <planeGeometry args={[groundSize, groundSize]} />
        <meshBasicMaterial color={GROUND} />
      </mesh>

      {/* District block tiles: the district's darkest tone, darkened further —
          a subtle neighborhood tint under each block (reads as its own ground,
          not paint, now that the base is dark too). */}
      {blocks.map((b) => (
        <mesh
          key={`tile-${b.slug}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[b.cx, 0.01, b.cz]}
          receiveShadow
        >
          <planeGeometry args={[b.x1 - b.x0 + 2, b.z1 - b.z0 + 2]} />
          <meshBasicMaterial
            color={shade(b.palette[2], -0.6)}
            polygonOffset
            polygonOffsetFactor={-0.5}
            polygonOffsetUnits={-0.5}
          />
        </mesh>
      ))}

      {/* "Rest of the city" filler around the real districts */}
      {bounds && <Outskirts bounds={bounds} horizon={SKY_HORIZON} />}

      {/* Animated ad boards (now-playing / top artists / districts / stats) */}
      <Billboards
        artists={artists}
        blocks={blocks}
        parks={parks}
        buckets={buckets}
        bounds={bounds}
        nowPlaying={nowPlaying}
        onFocus={focusOn}
      />

      {/* Gray pavement — one strip per street. Vertical and horizontal roads
          get distinct y + polygonOffset so they don't z-fight where they
          overlap at intersections. */}
      {roads.map((r, i) => {
        const vertical = r.axis === "z";
        const sx = vertical ? r.width : Math.abs(r.to - r.from);
        const sz = vertical ? Math.abs(r.to - r.from) : r.width;
        const px = vertical ? r.lane : (r.from + r.to) / 2;
        const pz = vertical ? (r.from + r.to) / 2 : r.lane;
        return (
          <mesh
            key={`road-${i}`}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[px, vertical ? 0.02 : 0.024, pz]}
            receiveShadow
          >
            <planeGeometry args={[sx, sz]} />
            <meshBasicMaterial
              color={ASPHALT}
              polygonOffset
              polygonOffsetFactor={vertical ? -1 : -1.5}
              polygonOffsetUnits={vertical ? -1 : -1.5}
            />
          </mesh>
        );
      })}

      {/* Faint dashed centerline running the full length of every road */}
      {roads.map((r, i) => (
        <Line
          key={`line-${i}`}
          points={
            r.axis === "z"
              ? [
                  [r.lane, 0.08, r.from],
                  [r.lane, 0.08, r.to],
                ]
              : [
                  [r.from, 0.08, r.lane],
                  [r.to, 0.08, r.lane],
                ]
          }
          color={ROAD_LINE}
          lineWidth={1.5}
          transparent
          opacity={0.35}
          dashed
          dashSize={2.4}
          gapSize={2.2}
        />
      ))}

      {/* Warm streetlights along the roads */}
      <Streetlights roads={roads} intersections={intersections} />

      {/* Parks fill any empty grid slots */}
      {parks.map((p, i) => (
        <Park key={`park-${i}`} park={p} seed={i + 1} />
      ))}

      {/* Roundabouts + traffic lights */}
      <StreetFurniture intersections={intersections} />

      {/* Ambient traffic */}
      <Cars roads={roads} />

      {/* Buildings */}
      {artists.map((a) => (
        <VoxelBuilding
          key={a.spotify_id}
          district={a.primary_genre_bucket}
          tier={a.tier}
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
        makeDefault
        enablePan
        enableZoom
        enableRotate
        minDistance={5}
        maxDistance={400}
        maxPolarAngle={Math.PI / 2 - 0.05}
        target={[0, 2, 0]}
      />
      <CameraRig focusRef={focusRef} />
    </>
  );
}
