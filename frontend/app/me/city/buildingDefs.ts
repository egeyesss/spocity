// Per-voxel building definitions for all designed districts × 3 tier variants.
// Ported from building-concepts.jsx (Claude Design session 2026-05-15).
//
// Coordinate convention: x grows right, y grows into screen (depth), z grows up.
// In R3F (y-up), translate as: R3F_x = (def_x - cx)*S, R3F_y = def_z*S + S/2, R3F_z = (def_y - cy)*S

export interface VoxelDef {
  x: number;
  y: number;
  z: number;
  color: string;
  /** Lit at dusk: rendered unshaded + boosted, like a light source. */
  glow?: boolean;
}

export type SpriteType =
  | "antenna"
  | "sign-face"
  | "sign-board"
  | "awning"
  | "smoke"
  | "flag"
  | "satellite"
  | "guitar";

export interface SpriteDef {
  type: SpriteType;
  x: number;
  y: number;
  z: number;
  h?: number;
  w?: number;
  color?: string;
  color1?: string;
  color2?: string;
  tipColor?: string;
  text?: string;
}

export interface BuildingDef {
  voxels: VoxelDef[];
  sprites: SpriteDef[];
}

export type BuildingVariant = "shack" | "house" | "apartment" | "skyscraper";

type DistrictLibrary = Record<BuildingVariant, BuildingDef>;

// ── DSL helpers ────────────────────────────────────────────────────────────────

function box(
  x0: number, x1: number,
  y0: number, y1: number,
  z0: number, z1: number,
  color: string,
): VoxelDef[] {
  const out: VoxelDef[] = [];
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        out.push({ x, y, z, color });
  return out;
}

function sv(x: number, y: number, z: number, color: string): VoxelDef {
  return { x, y, z, color };
}

function paint(
  voxels: VoxelDef[],
  predicate: (v: VoxelDef) => boolean,
  color: string,
): VoxelDef[] {
  return voxels.map((v) => (predicate(v) ? { ...v, color } : v));
}

// Like paint, but the painted voxels glow (lit windows, marquee bands).
function paintGlow(
  voxels: VoxelDef[],
  predicate: (v: VoxelDef) => boolean,
  color: string,
): VoxelDef[] {
  return voxels.map((v) =>
    predicate(v) ? { ...v, color, glow: true } : v,
  );
}

// Mark an already-built voxel list as glowing (for box() additions).
function glowAll(voxels: VoxelDef[]): VoxelDef[] {
  return voxels.map((v) => ({ ...v, glow: true }));
}

// Deduplicate same (x,y,z) coords — last entry wins (matches SVG painter behavior).
function dedup(voxels: VoxelDef[]): VoxelDef[] {
  const map = new Map<string, VoxelDef>();
  for (const v of voxels) map.set(`${v.x},${v.y},${v.z}`, v);
  return Array.from(map.values());
}

// Shade a hex color. amt in [-1, 1]: positive lightens, negative darkens.
export function shade(hex: string, amt: number): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const adj = (v: number) =>
    Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  const hx = (v: number) => v.toString(16).padStart(2, "0");
  return "#" + hx(adj(r)) + hx(adj(g)) + hx(adj(b));
}

// ── Shack ─────────────────────────────────────────────────────────────────────
//
// The smallest tier. A 2×2 single-floor hut: walls + door + 1–2 lit windows +
// a colored roof cap, in the district's own vocabulary. Deliberately ~2 voxels
// tall (3 with an optional chimney) so it stays clearly the smallest building
// next to the 3–5-tall houses — but it now reads as a tiny building with
// character instead of a bare cube. A short antenna on the tech districts
// (the only sprite type that renders in 3D) adds a bit of life.

function shackDef(opts: {
  wall: string;
  roof: string;
  door: string;
  window: string;
  /** small chimney voxel on the roof — silhouette interest, still tiny */
  chimney?: string;
  /** add a second window on the side face */
  twoWindows?: boolean;
  /** glowing antenna tip color (electronic / metal) */
  antennaTip?: string;
}): BuildingDef {
  return {
    voxels: dedup(
      (() => {
        let vs = box(0, 1, 0, 1, 0, 0, opts.wall); // 2×2 single floor
        // front door + lit window(s)
        vs = paint(vs, (v) => v.x === 0 && v.y === 0 && v.z === 0, opts.door);
        vs = paintGlow(vs, (v) => v.x === 1 && v.y === 0 && v.z === 0, opts.window);
        if (opts.twoWindows)
          vs = paintGlow(vs, (v) => v.x === 1 && v.y === 1 && v.z === 0, opts.window);
        vs = vs.concat(box(0, 1, 0, 1, 1, 1, opts.roof)); // roof cap
        if (opts.chimney) vs = vs.concat([sv(1, 1, 2, opts.chimney)]);
        return vs;
      })(),
    ),
    sprites: opts.antennaTip
      ? [{ type: "antenna", x: 0, y: 0, z: 2, h: 3, color: "#0a0812", tipColor: opts.antennaTip }]
      : [],
  };
}

// ── Electronic — cyan glasshouse towers ───────────────────────────────────────

const electronic: DistrictLibrary = {
  shack: shackDef({
    wall: "#155E75",
    roof: "#06B6D4",
    door: "#0E7490",
    window: "#FBBF24",
    twoWindows: true,
    antennaTip: "#EC4899",
  }),
  house: {
    voxels: dedup((() => {
      let vs = box(0, 1, 0, 1, 0, 1, "#155E75");
      vs = vs.concat(box(0, 1, 0, 1, 2, 2, "#06B6D4"));
      vs = paintGlow(vs, (v) => v.x === 1 && v.y === 0 && v.z === 1, "#FBBF24");
      return vs;
    })()),
    sprites: [
      { type: "antenna", x: 0, y: 1, z: 3, h: 5, color: "#0a0812", tipColor: "#EC4899" },
      { type: "satellite", x: 1, y: 0, z: 3, color: "#9CA3AF" },
    ],
  },
  apartment: {
    voxels: dedup((() => {
      let vs = box(0, 2, 0, 2, 0, 5, "#0E7490");
      vs = vs.map((v) => {
        const isOuter = v.x === 0 || v.x === 2 || v.y === 0 || v.y === 2;
        if (isOuter && (v.z === 1 || v.z === 3)) return { ...v, color: "#06B6D4" };
        if (isOuter && (v.z === 2 || v.z === 4))
          return { ...v, color: "#22D3EE", glow: true }; // lit glass band
        return v;
      });
      vs = vs.concat(box(0, 2, 0, 2, 6, 6, "#155E75"));
      vs = vs.concat(box(1, 1, 1, 1, 7, 7, "#06B6D4"));
      return vs;
    })()),
    sprites: [
      { type: "antenna", x: 1, y: 1, z: 8, h: 4, tipColor: "#FBBF24" },
      { type: "sign-face", x: 0, y: 0, z: 4, w: 1.4, h: 1.2, text: "NEON", color: "#EC4899" },
    ],
  },
  skyscraper: {
    voxels: dedup((() => {
      let vs = box(0, 1, 0, 1, 0, 11, "#155E75");
      vs = vs.map((v) =>
        v.z % 2 === 1 ? { ...v, color: "#22D3EE", glow: true } : v,
      );
      vs = vs.concat(box(0, 0, 0, 0, 12, 13, "#06B6D4"));
      vs = vs.concat(box(-1, 2, -1, 2, 0, 0, "#0E7490")); // wide podium — dedup resolves overlap
      return vs;
    })()),
    sprites: [
      { type: "antenna", x: 0, y: 0, z: 14, h: 6, tipColor: "#EF4444" },
      { type: "sign-face", x: 1, y: 0, z: 6, w: 1.5, h: 2.5, text: "24/7", color: "#EC4899" },
    ],
  },
};

// ── Pop — pastel pink peaked roofs ────────────────────────────────────────────

const pop: DistrictLibrary = {
  shack: shackDef({
    wall: "#FFC1D9",
    roof: "#FFE599",
    door: "#DC2626",
    window: "#FAFAF5",
    twoWindows: true,
  }),
  house: {
    voxels: dedup((() => {
      let vs = box(0, 2, 0, 1, 0, 1, "#FFC1D9");
      vs = paint(vs, (v) => v.x === 1 && v.y === 0 && v.z === 0, "#DC2626");
      vs = vs.concat(box(0, 2, 0, 1, 2, 2, "#FFE599"));
      vs = vs.concat(box(1, 1, 0, 1, 3, 3, "#FFC107"));
      return vs;
    })()),
    sprites: [
      { type: "awning", x: 0, y: 0, z: 1, w: 3, color1: "#DC2626", color2: "#FAFAF5" },
      { type: "flag", x: 1, y: 1, z: 4, color: "#FF69B4", h: 4 },
    ],
  },
  apartment: {
    voxels: dedup((() => {
      let vs = box(0, 2, 0, 2, 0, 1, "#FFD1DC");
      vs = vs.concat(box(0, 2, 0, 2, 2, 3, "#FFC1D9"));
      vs = vs.concat(box(0, 2, 0, 2, 4, 4, "#FF8FCB"));
      vs = vs.concat(box(0, 1, 0, 1, 5, 6, "#FFD1DC"));
      vs = paintGlow(
        vs,
        (v) => (v.x === 0 || v.x === 2 || v.y === 0 || v.y === 2) && v.z === 1 && (v.x + v.y) % 2 === 0,
        "#FAFAF5",
      );
      vs = paintGlow(
        vs,
        (v) => (v.x === 0 || v.x === 2 || v.y === 0 || v.y === 2) && v.z === 3 && (v.x + v.y) % 2 === 1,
        "#FAFAF5",
      );
      return vs;
    })()),
    sprites: [
      { type: "sign-face", x: 2, y: 0, z: 5, w: 1.2, h: 1.2, text: "♥", color: "#FFC107" },
      { type: "flag", x: 0, y: 1, z: 7, color: "#FF69B4", h: 3 },
    ],
  },
  skyscraper: {
    voxels: dedup((() => {
      let vs = box(-1, 2, -1, 2, 0, 0, "#FFD1DC");
      vs = vs.concat(box(0, 1, 0, 1, 1, 4, "#FFC1D9"));
      vs = vs.concat(box(0, 1, 0, 1, 5, 5, "#FF8FCB"));
      vs = vs.concat(box(0, 1, 0, 1, 6, 8, "#FFD1DC"));
      vs = vs.concat(box(0, 1, 0, 1, 9, 9, "#FF69B4"));
      vs = vs.concat(box(0, 0, 0, 0, 10, 11, "#FFE599"));
      vs = paintGlow(
        vs,
        (v) =>
          (v.x === 0 || v.x === 1) &&
          (v.y === 0 || v.y === 1) &&
          (v.z === 2 || v.z === 3 || v.z === 6 || v.z === 7) &&
          (v.x + v.y + v.z) % 2 === 0,
        "#FFC107",
      );
      return vs;
    })()),
    sprites: [
      { type: "sign-face", x: 0, y: 0, z: 11, w: 1.4, h: 1.4, text: "★", color: "#FFC107" },
      { type: "antenna", x: 0, y: 0, z: 12, h: 3, color: "#0a0812", tipColor: "#FF69B4" },
    ],
  },
};

// ── Hip-Hop — brick brownstones, gold trim ────────────────────────────────────

const hiphop: DistrictLibrary = {
  shack: shackDef({
    wall: "#A0522D",
    roof: "#FFC107",
    door: "#1a1a1a",
    window: "#FFE599",
    chimney: "#5a2d11",
  }),
  house: {
    voxels: dedup((() => {
      let vs = box(0, 2, 0, 1, 0, 2, "#A0522D");
      vs = paint(vs, (v) => v.z === 1, "#8B4513");
      vs = paint(vs, (v) => v.x === 1 && v.y === 0 && v.z === 0, "#1a1a1a");
      vs = vs.concat(box(0, 2, 0, 1, 3, 3, "#FFC107"));
      return vs;
    })()),
    sprites: [
      { type: "sign-face", x: 0, y: 0, z: 2, w: 1.5, h: 0.9, text: "CORNER", color: "#FFC107" },
      { type: "flag", x: 2, y: 1, z: 4, color: "#FFC107", h: 4 },
    ],
  },
  apartment: {
    voxels: dedup((() => {
      let vs = box(0, 3, 0, 1, 0, 4, "#7c3a17");
      vs = vs.concat(box(0, 1, 2, 3, 0, 4, "#7c3a17"));
      vs = paint(vs, (v) => v.z === 2, "#B8860B");
      vs = paintGlow(vs, (v) => (v.x === 0 || v.x === 3) && v.y === 0 && (v.z === 1 || v.z === 3), "#FFE599");
      vs = paintGlow(vs, (v) => v.x === 0 && (v.y === 2 || v.y === 3) && (v.z === 1 || v.z === 3), "#FFE599");
      vs = vs.concat(box(2, 2, 0, 0, 5, 6, "#5a2d11"));
      return vs;
    })()),
    sprites: [
      { type: "satellite", x: 3, y: 1, z: 5, color: "#FFC107" },
      { type: "awning", x: 0, y: 0, z: 1, w: 4, color1: "#1a1a1a", color2: "#FFC107" },
    ],
  },
  skyscraper: {
    voxels: dedup((() => {
      let vs = box(-1, 2, -1, 2, 0, 0, "#3a2511");
      vs = vs.concat(box(0, 1, 0, 1, 1, 10, "#5a3a18"));
      vs = paint(vs, (v) => v.z === 3 || v.z === 6 || v.z === 9, "#B8860B");
      vs = vs.concat(box(0, 1, 0, 1, 11, 12, "#FFC107"));
      vs = vs.concat(box(0, 0, 0, 0, 13, 13, "#FFD700"));
      vs = paintGlow(vs, (v) => v.z >= 1 && v.z <= 10 && v.z % 2 === 0 && v.x + v.y === 1, "#FFE599");
      return vs;
    })()),
    sprites: [
      { type: "antenna", x: 0, y: 0, z: 14, h: 5, tipColor: "#FFC107" },
      { type: "sign-face", x: 1, y: 0, z: 5, w: 1.2, h: 1.5, text: "$", color: "#FFC107" },
    ],
  },
};

// ── Rock — dark red brick, black accents ──────────────────────────────────────

const rock: DistrictLibrary = {
  shack: shackDef({
    wall: "#7c1a1a",
    roof: "#1a0a0a",
    door: "#1a0a0a",
    window: "#EF4444",
  }),
  house: {
    voxels: dedup((() => {
      let vs = box(0, 2, 0, 2, 0, 1, "#7c1a1a");
      vs = paint(vs, (v) => v.z === 0, "#1a0a0a");
      vs = vs.concat(box(0, 2, 0, 2, 2, 2, "#5a0e0e"));
      vs = vs.concat(box(1, 1, 0, 2, 3, 3, "#1a0a0a"));
      return vs;
    })()),
    sprites: [
      { type: "sign-face", x: 2, y: 0, z: 1, w: 1.4, h: 1.2, text: "BAR", color: "#EF4444" },
      { type: "guitar", x: 0, y: 0, z: 3, color: "#FAFAF5" },
    ],
  },
  apartment: {
    voxels: dedup((() => {
      let vs = box(0, 3, 0, 2, 0, 3, "#5a0e0e");
      vs = paint(vs, (v) => v.z === 0, "#1a0a0a");
      vs = paint(vs, (v) => v.z === 3, "#1a0a0a");
      vs = paintGlow(vs, (v) => (v.x === 0 || v.x === 3) && (v.z === 1 || v.z === 2) && v.y === 0, "#EF4444");
      vs = vs.concat(box(1, 2, 1, 1, 4, 4, "#7c1a1a"));
      return vs;
    })()),
    sprites: [
      { type: "sign-face", x: 0, y: 0, z: 4, w: 2.2, h: 1.0, text: "ROCK", color: "#EF4444" },
      { type: "antenna", x: 3, y: 0, z: 4, h: 3, tipColor: "#EF4444" },
    ],
  },
  skyscraper: {
    voxels: dedup((() => {
      let vs = box(-1, 3, -1, 3, 0, 1, "#3a0a0a");
      vs = paint(vs, (v) => v.z === 0, "#1a0a0a");
      vs = vs.concat(box(0, 2, 0, 2, 2, 3, "#7c1a1a"));
      vs = vs.concat(box(1, 1, 1, 1, 4, 9, "#1a0a0a"));
      vs = paintGlow(vs, (v) => v.x === 1 && v.y === 1 && v.z === 6, "#EF4444");
      vs = paintGlow(vs, (v) => v.x === 1 && v.y === 1 && v.z === 8, "#EF4444");
      return vs;
    })()),
    sprites: [
      { type: "antenna", x: 1, y: 1, z: 10, h: 6, color: "#1a0a0a", tipColor: "#EF4444" },
      { type: "guitar", x: -1, y: 1, z: 2, color: "#EF4444" },
      { type: "flag", x: 3, y: 3, z: 2, color: "#EF4444", h: 5 },
    ],
  },
};

// ── Folk — wood tones, green pitched roofs, chimney smoke ─────────────────────

const folk: DistrictLibrary = {
  shack: shackDef({
    wall: "#8B6F47",
    roof: "#15803D",
    door: "#5a4225",
    window: "#FFE599",
    chimney: "#6b5532",
  }),
  house: {
    voxels: dedup((() => {
      let vs = box(0, 2, 0, 1, 0, 1, "#8B6F47");
      vs = paint(vs, (v) => v.x === 1 && v.y === 0 && v.z === 0, "#5a4225");
      // roof: exclude chimney position (x=2, y=1) to avoid duplicate at z=2
      vs = vs.concat(box(0, 2, 0, 1, 2, 2, "#15803D").filter((v) => !(v.x === 2 && v.y === 1)));
      vs = vs.concat(box(1, 1, 0, 1, 3, 3, "#22C55E"));
      vs = vs.concat(box(2, 2, 1, 1, 2, 3, "#6b5532")); // chimney
      return vs;
    })()),
    sprites: [
      { type: "smoke", x: 2, y: 1, z: 4 },
      { type: "flag", x: 1, y: 1, z: 4, color: "#22C55E", h: 3 },
    ],
  },
  apartment: {
    voxels: dedup((() => {
      let vs = box(0, 3, 0, 1, 0, 2, "#A0805A");
      vs = paint(vs, (v) => v.z === 1 && v.x % 2 === 0, "#8B6F47");
      vs = paintGlow(vs, (v) => v.y === 0 && v.z === 1 && (v.x === 1 || v.x === 3), "#FFE599");
      vs = vs.concat(box(0, 3, 0, 1, 3, 3, "#1f6b30"));
      vs = vs.concat(box(0, 3, 0, 1, 4, 4, "#15803D").filter((v) => v.x % 2 === 0));
      return vs;
    })()),
    sprites: [
      { type: "smoke", x: 0, y: 1, z: 4 },
      { type: "awning", x: 0, y: 0, z: 1, w: 4, color1: "#15803D", color2: "#F4F0E6" },
    ],
  },
  skyscraper: {
    voxels: dedup((() => {
      let vs = box(0, 1, 0, 1, 0, 9, "#8B6F47");
      vs = paint(vs, (v) => v.z === 2 || v.z === 5 || v.z === 8, "#22C55E");
      vs = paintGlow(vs, (v) => (v.z === 3 || v.z === 6) && v.x + v.y === 1, "#FFE599");
      vs = vs.concat(box(-1, 2, -1, 2, 0, 0, "#6b5532")); // broad base — dedup handles overlap
      vs = vs.concat(box(-1, 2, -1, 2, 10, 10, "#15803D")); // green crown
      vs = vs.concat(box(0, 1, 0, 1, 11, 11, "#22C55E"));
      return vs;
    })()),
    sprites: [
      { type: "flag", x: 1, y: 0, z: 12, color: "#22C55E", h: 4 },
      { type: "smoke", x: -1, y: -1, z: 1, color: "rgba(180,200,170,0.5)" },
    ],
  },
};

// ── Jazz — deep indigo, gold art-deco pinstripes ──────────────────────────────

const jazz: DistrictLibrary = {
  shack: shackDef({
    wall: "#3730A3",
    roof: "#B8860B",
    door: "#B8860B",
    window: "#FFC107",
  }),
  house: {
    voxels: dedup((() => {
      let vs = box(0, 2, 0, 1, 0, 1, "#3730A3");
      vs = paint(vs, (v) => v.z === 0, "#1e1b4b");
      vs = paint(vs, (v) => v.x === 1 && v.y === 0 && v.z === 0, "#B8860B");
      vs = vs.concat(glowAll(box(0, 2, 0, 1, 2, 2, "#B8860B"))); // lit marquee cap
      return vs;
    })()),
    sprites: [
      { type: "sign-face", x: 2, y: 0, z: 1, w: 1.2, h: 1.0, text: "JAZZ", color: "#FFC107" },
      { type: "awning", x: 0, y: 0, z: 1, w: 3, color1: "#3730A3", color2: "#B8860B" },
    ],
  },
  apartment: {
    voxels: dedup((() => {
      let vs = box(0, 2, 0, 2, 0, 3, "#1e1b4b");
      vs = paint(
        vs,
        (v) => (v.x === 0 || v.x === 2) && v.y === 0 && (v.z === 1 || v.z === 2),
        "#B8860B",
      );
      vs = paint(
        vs,
        (v) => v.x === 0 && (v.y === 1 || v.y === 2) && (v.z === 1 || v.z === 2),
        "#B8860B",
      );
      vs = vs.concat(box(1, 1, 1, 1, 4, 5, "#3730A3"));
      vs = vs.concat(glowAll(box(1, 1, 1, 1, 6, 6, "#B8860B"))); // lit marquee cap
      return vs;
    })()),
    sprites: [
      { type: "sign-face", x: 0, y: 0, z: 3, w: 2, h: 1.1, text: "BLUE", color: "#FFC107" },
      { type: "antenna", x: 1, y: 1, z: 7, h: 3, tipColor: "#FFC107" },
    ],
  },
  skyscraper: {
    voxels: dedup((() => {
      let vs = box(-1, 2, -1, 2, 0, 0, "#1e1b4b");
      vs = vs.concat(box(0, 1, 0, 1, 1, 6, "#3730A3"));
      vs = vs.concat(glowAll(box(0, 1, 0, 1, 7, 7, "#B8860B"))); // marquee band
      vs = vs.concat(box(0, 1, 0, 1, 8, 10, "#3730A3"));
      vs = vs.concat(glowAll(box(0, 1, 0, 1, 11, 11, "#B8860B"))); // marquee band
      vs = vs.concat(box(0, 0, 0, 0, 12, 14, "#3730A3"));
      vs = vs.concat(glowAll([sv(0, 0, 15, "#B8860B")])); // lit spire tip
      vs = paintGlow(
        vs,
        (v) => v.x === 0 && v.y === 0 && v.z >= 2 && v.z <= 6 && v.z % 2 === 0,
        "#6366F1",
      );
      vs = paintGlow(
        vs,
        (v) => v.x === 1 && v.y === 1 && v.z >= 2 && v.z <= 6 && v.z % 2 === 1,
        "#6366F1",
      );
      return vs;
    })()),
    sprites: [
      { type: "antenna", x: 0, y: 0, z: 16, h: 5, color: "#1e1b4b", tipColor: "#FFC107" },
    ],
  },
};

// ── R&B / Soul — plum & lavender, warm gold accents, soft setbacks ────────────

const rnb: DistrictLibrary = {
  shack: shackDef({
    wall: "#7C5DB8",
    roof: "#9F7AEA",
    door: "#B8860B",
    window: "#D6BCFA",
    twoWindows: true,
  }),
  house: {
    voxels: dedup((() => {
      let vs = box(0, 2, 0, 1, 0, 2, "#7C5DB8");
      vs = paint(vs, (v) => v.z === 0, "#553C9A");
      vs = paint(vs, (v) => v.x === 1 && v.y === 0 && v.z === 0, "#B8860B");
      vs = paintGlow(vs, (v) => v.y === 0 && v.z === 1 && (v.x === 0 || v.x === 2), "#D6BCFA");
      vs = vs.concat(box(0, 2, 0, 1, 3, 3, "#9F7AEA"));
      return vs;
    })()),
    sprites: [
      { type: "sign-face", x: 2, y: 0, z: 2, w: 1.4, h: 1.0, text: "SOUL", color: "#FFC107" },
      { type: "flag", x: 1, y: 1, z: 4, color: "#9F7AEA", h: 3 },
    ],
  },
  apartment: {
    voxels: dedup((() => {
      let vs = box(0, 2, 0, 2, 0, 5, "#6B4FA0");
      vs = paint(vs, (v) => v.z === 0, "#553C9A");
      vs = paintGlow(
        vs,
        (v) => (v.x === 0 || v.x === 2 || v.y === 0 || v.y === 2) && (v.z === 1 || v.z === 4),
        "#D6BCFA",
      );
      vs = paint(vs, (v) => v.z === 2, "#B8860B");
      vs = vs.concat(box(0, 1, 0, 1, 6, 7, "#7C5DB8"));
      return vs;
    })()),
    sprites: [
      { type: "sign-face", x: 0, y: 0, z: 4, w: 1.6, h: 1.2, text: "R&B", color: "#FFC107" },
      { type: "antenna", x: 1, y: 1, z: 8, h: 3, tipColor: "#FFC107" },
    ],
  },
  skyscraper: {
    voxels: dedup((() => {
      let vs = box(-1, 2, -1, 2, 0, 0, "#553C9A");
      vs = vs.concat(box(0, 1, 0, 1, 1, 9, "#6B4FA0"));
      vs = paintGlow(
        vs,
        (v) => (v.x === 0 || v.x === 1) && (v.y === 0 || v.y === 1) && v.z % 3 === 2,
        "#D6BCFA",
      );
      vs = paint(vs, (v) => v.z === 4 || v.z === 8, "#B8860B");
      vs = vs.concat(box(0, 0, 0, 0, 10, 13, "#7C5DB8"));
      return vs;
    })()),
    sprites: [
      { type: "antenna", x: 0, y: 0, z: 14, h: 5, color: "#1f1530", tipColor: "#FFC107" },
      { type: "sign-face", x: 1, y: 0, z: 6, w: 1.4, h: 2.0, text: "SOUL", color: "#D6BCFA" },
    ],
  },
};

// ── Metal — near-black mass, steel-gray accents, angular spires ────────────────

const metal: DistrictLibrary = {
  shack: shackDef({
    wall: "#2D3748",
    roof: "#0F1419",
    door: "#0F1419",
    window: "#4A5568",
    antennaTip: "#A0AEC0",
  }),
  house: {
    voxels: dedup((() => {
      let vs = box(0, 2, 0, 1, 0, 2, "#2D3748");
      vs = paint(vs, (v) => v.z === 0, "#1A202C");
      vs = paintGlow(vs, (v) => v.y === 0 && v.z === 1 && (v.x === 0 || v.x === 2), "#4A5568");
      vs = vs.concat(box(1, 1, 0, 1, 3, 4, "#1A202C")); // angular spike
      return vs;
    })()),
    sprites: [
      { type: "guitar", x: 0, y: 0, z: 2, color: "#A0AEC0" },
      { type: "flag", x: 2, y: 1, z: 3, color: "#4A5568", h: 4 },
    ],
  },
  apartment: {
    voxels: dedup((() => {
      let vs = box(0, 2, 0, 2, 0, 5, "#1A202C");
      vs = paintGlow(
        vs,
        (v) =>
          (v.x === 0 || v.x === 2 || v.y === 0 || v.y === 2) &&
          (v.z === 1 || v.z === 3) &&
          (v.x + v.y) % 2 === 0,
        "#4A5568",
      );
      vs = vs.concat(box(1, 1, 1, 1, 6, 9, "#0F1419")); // black spire
      return vs;
    })()),
    sprites: [
      { type: "sign-face", x: 0, y: 0, z: 4, w: 2.0, h: 1.0, text: "METAL", color: "#A0AEC0" },
      { type: "antenna", x: 2, y: 0, z: 5, h: 3, color: "#0F1419", tipColor: "#A0AEC0" },
    ],
  },
  skyscraper: {
    voxels: dedup((() => {
      let vs = box(-1, 2, -1, 2, 0, 1, "#0F1419");
      vs = vs.concat(box(0, 1, 0, 1, 2, 10, "#1A202C"));
      vs = paint(vs, (v) => v.z === 4 || v.z === 7 || v.z === 10, "#4A5568");
      vs = vs.concat(box(0, 0, 0, 0, 11, 15, "#1A202C")); // sharp spire
      return vs;
    })()),
    sprites: [
      { type: "antenna", x: 0, y: 0, z: 16, h: 6, color: "#0F1419", tipColor: "#A0AEC0" },
      { type: "guitar", x: -1, y: 1, z: 2, color: "#A0AEC0" },
    ],
  },
};

// ── Classical — cream stone, tan pillars, arched windows ──────────────────────

const classical: DistrictLibrary = {
  shack: shackDef({
    wall: "#F5F5DC",
    roof: "#E8DCC4",
    door: "#B8A582",
    window: "#B8A582",
    twoWindows: true,
  }),
  house: {
    voxels: dedup((() => {
      let vs = box(0, 2, 0, 1, 0, 2, "#F5F5DC");
      vs = paint(vs, (v) => v.z === 0, "#E8DCC4");
      vs = paint(vs, (v) => (v.x === 0 || v.x === 2) && v.z <= 1, "#B8A582"); // corner pillars
      vs = paintGlow(vs, (v) => v.x === 1 && v.y === 0 && v.z === 1, "#B8A582"); // arch window
      vs = vs.concat(box(0, 2, 0, 1, 3, 3, "#E8DCC4")); // cornice
      return vs;
    })()),
    sprites: [
      { type: "sign-face", x: 2, y: 0, z: 2, w: 1.2, h: 0.9, text: "OPUS", color: "#B8A582" },
      { type: "flag", x: 1, y: 1, z: 4, color: "#E8DCC4", h: 3 },
    ],
  },
  apartment: {
    voxels: dedup((() => {
      let vs = box(0, 2, 0, 2, 0, 5, "#F5F5DC");
      vs = paint(vs, (v) => v.z === 0, "#E8DCC4");
      vs = paint(
        vs,
        (v) => (v.x === 0 || v.x === 2) && (v.y === 0 || v.y === 2),
        "#B8A582",
      ); // pillared corners full height
      vs = paintGlow(
        vs,
        (v) => v.x === 1 && v.y === 0 && (v.z === 2 || v.z === 4),
        "#E8DCC4",
      ); // arched windows
      vs = vs.concat(box(0, 2, 0, 2, 6, 6, "#B8A582")); // entablature
      vs = vs.concat(box(1, 1, 1, 1, 7, 7, "#F5F5DC"));
      return vs;
    })()),
    sprites: [
      { type: "sign-face", x: 0, y: 0, z: 4, w: 2.0, h: 1.1, text: "HALL", color: "#B8A582" },
      { type: "antenna", x: 1, y: 1, z: 8, h: 3, color: "#B8A582", tipColor: "#E8DCC4" },
    ],
  },
  skyscraper: {
    voxels: dedup((() => {
      let vs = box(-1, 2, -1, 2, 0, 1, "#E8DCC4");
      vs = paint(
        vs,
        (v) => v.z === 1 && (v.x === -1 || v.x === 2 || v.y === -1 || v.y === 2),
        "#B8A582",
      ); // colonnade ring
      vs = vs.concat(box(0, 1, 0, 1, 2, 10, "#F5F5DC"));
      vs = paint(vs, (v) => v.z === 5 || v.z === 9, "#B8A582"); // cornice bands
      vs = vs.concat(box(0, 0, 0, 0, 11, 13, "#E8DCC4")); // stepped cap
      return vs;
    })()),
    sprites: [
      { type: "antenna", x: 0, y: 0, z: 14, h: 4, color: "#B8A582", tipColor: "#FFE599" },
      { type: "sign-face", x: 1, y: 0, z: 6, w: 1.4, h: 2.0, text: "OPERA", color: "#E8DCC4" },
    ],
  },
};

// ── Latin — terracotta walls, warm orange bands, awnings ──────────────────────

const latin: DistrictLibrary = {
  shack: shackDef({
    wall: "#9A3412",
    roof: "#C2410C",
    door: "#7A2A0E",
    window: "#FED7AA",
    twoWindows: true,
  }),
  house: {
    voxels: dedup((() => {
      let vs = box(0, 2, 0, 1, 0, 2, "#9A3412");
      vs = paint(vs, (v) => v.z === 0, "#7A2A0E");
      vs = paint(vs, (v) => v.z === 2, "#F97316"); // decorative band
      vs = paintGlow(vs, (v) => v.y === 0 && v.z === 1 && (v.x === 0 || v.x === 2), "#FED7AA");
      vs = vs.concat(box(0, 2, 0, 1, 3, 3, "#C2410C"));
      return vs;
    })()),
    sprites: [
      { type: "awning", x: 0, y: 0, z: 1, w: 3, color1: "#F97316", color2: "#FED7AA" },
      { type: "flag", x: 2, y: 1, z: 4, color: "#F97316", h: 3 },
    ],
  },
  apartment: {
    voxels: dedup((() => {
      let vs = box(0, 2, 0, 2, 0, 5, "#9A3412");
      vs = paint(vs, (v) => v.z === 0, "#7A2A0E");
      vs = paintGlow(
        vs,
        (v) => (v.x === 0 || v.x === 2 || v.y === 0 || v.y === 2) && (v.z === 1 || v.z === 4),
        "#FED7AA",
      );
      vs = paint(vs, (v) => v.z === 3, "#F97316"); // decorative band
      vs = vs.concat(box(0, 1, 0, 1, 6, 7, "#C2410C"));
      return vs;
    })()),
    sprites: [
      { type: "awning", x: 0, y: 0, z: 1, w: 4, color1: "#F97316", color2: "#FED7AA" },
      { type: "sign-face", x: 2, y: 0, z: 4, w: 1.4, h: 1.2, text: "SOL", color: "#F97316" },
    ],
  },
  skyscraper: {
    voxels: dedup((() => {
      let vs = box(-1, 2, -1, 2, 0, 0, "#7A2A0E");
      vs = vs.concat(box(0, 1, 0, 1, 1, 10, "#9A3412"));
      vs = paint(vs, (v) => v.z === 3 || v.z === 6 || v.z === 9, "#F97316"); // bands
      vs = paintGlow(
        vs,
        (v) => (v.x === 0 || v.x === 1) && (v.y === 0 || v.y === 1) && v.z % 3 === 1,
        "#FED7AA",
      );
      vs = vs.concat(box(0, 0, 0, 0, 11, 13, "#C2410C"));
      return vs;
    })()),
    sprites: [
      { type: "antenna", x: 0, y: 0, z: 14, h: 5, color: "#7A2A0E", tipColor: "#F97316" },
      { type: "sign-face", x: 1, y: 0, z: 6, w: 1.4, h: 2.0, text: "SOL", color: "#FED7AA" },
    ],
  },
};

// ── Other — quiet neutral concrete (intentionally understated) ────────────────

const other: DistrictLibrary = {
  shack: shackDef({
    wall: "#9CA3AF",
    roof: "#6B7280",
    door: "#4B5563",
    window: "#D4D4D8",
  }),
  house: {
    voxels: dedup((() => {
      let vs = box(0, 1, 0, 1, 0, 2, "#9CA3AF");
      vs = paint(vs, (v) => v.z === 0, "#4B5563");
      return vs;
    })()),
    sprites: [],
  },
  apartment: {
    voxels: dedup((() => {
      let vs = box(0, 1, 0, 1, 0, 5, "#9CA3AF");
      vs = paint(vs, (v) => v.z === 0, "#4B5563");
      vs = paint(vs, (v) => v.z === 3, "#6B7280");
      return vs;
    })()),
    sprites: [],
  },
  skyscraper: {
    voxels: dedup((() => {
      let vs = box(-1, 1, -1, 1, 0, 0, "#4B5563");
      vs = vs.concat(box(0, 1, 0, 1, 1, 11, "#9CA3AF"));
      vs = paint(vs, (v) => v.z === 4 || v.z === 8, "#6B7280");
      return vs;
    })()),
    sprites: [
      { type: "antenna", x: 0, y: 0, z: 12, h: 3, color: "#374151", tipColor: "#9CA3AF" },
    ],
  },
};

// ── Library & lookup ──────────────────────────────────────────────────────────

// Keyed by backend bucket slug (genres.py::BUCKETS) so lookups match the API.
const BUILDING_LIBRARY: Record<string, DistrictLibrary> = {
  pop,
  "hip-hop": hiphop,
  "r-and-b-soul": rnb,
  rock,
  metal,
  electronic,
  "folk-singer-songwriter": folk,
  classical,
  jazz,
  latin,
  other,
};

export function lookupBuildingDef(
  district: string | null,
  tier: string | null,
): BuildingDef | null {
  if (!district || !tier) return null;
  const lib = BUILDING_LIBRARY[district];
  if (!lib) return null;

  let variant: BuildingVariant;
  switch (tier) {
    case "shack":
      variant = "shack";
      break;
    case "house":
      variant = "house";
      break;
    case "apartment":
    case "office":
      variant = "apartment";
      break;
    case "skyscraper":
    case "landmark":
      variant = "skyscraper";
      break;
    default:
      return null; // unknown tier: fall back to the palette column
  }

  return lib[variant] ?? null;
}
