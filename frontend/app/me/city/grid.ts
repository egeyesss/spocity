import { DISTRICT_COLS, BUILDING_PITCH, ROAD_WIDTH } from "./constants";
import type { ArtistRow, BucketRow, PlacedArtist } from "./types";

// World-space ground footprint of one district, plus its grid slot. CityScene
// uses these to paint the colored block tile; the asphalt base plane shows
// through the gaps between blocks as roads.
export interface DistrictBlock {
  slug: string;
  label: string;
  count: number;
  col: number;
  row: number;
  palette: [string, string, string];
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  cx: number;
  cz: number;
}

// An unused grid slot (more cells than districts) — rendered as a green park
// so there are no blank lots between the roads.
export interface ParkCell {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  cx: number;
  cz: number;
}

export interface CityLayout {
  placed: PlacedArtist[];
  blocks: DistrictBlock[];
  parks: ParkCell[];
}

// One straight street. `axis` is the direction cars travel; `lane` is the
// fixed perpendicular world coordinate of the road's centerline.
export interface Road {
  axis: "x" | "z";
  lane: number;
  from: number;
  to: number;
  width: number;
}

export interface CityBounds {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

// A point where two roads cross. `interior` is false for the perimeter ring
// (used to keep traffic lights off the outer edge so it stays uncluttered).
export interface Intersection {
  x: number;
  z: number;
  interior: boolean;
}

/**
 * Derive the street network from the block layout: one road down every gap
 * between adjacent block columns/rows, plus a perimeter ring. Returned roads
 * drive the gray pavement meshes, the yellow centerlines, and the car paths;
 * intersections drive the roundabouts and traffic lights.
 */
export function cityRoads(blocks: DistrictBlock[]): {
  roads: Road[];
  bounds: CityBounds | null;
  intersections: Intersection[];
} {
  if (blocks.length === 0)
    return { roads: [], bounds: null, intersections: [] };

  const bx0 = Math.min(...blocks.map((b) => b.x0));
  const bx1 = Math.max(...blocks.map((b) => b.x1));
  const bz0 = Math.min(...blocks.map((b) => b.z0));
  const bz1 = Math.max(...blocks.map((b) => b.z1));
  const m = ROAD_WIDTH;
  const bounds: CityBounds = {
    x0: bx0 - m,
    x1: bx1 + m,
    z0: bz0 - m,
    z1: bz1 + m,
  };

  const cols = [...new Set(blocks.map((b) => b.col))].sort((a, b) => a - b);
  const colLeft = new Map<number, number>();
  const colRight = new Map<number, number>();
  for (const c of cols) {
    const bs = blocks.filter((b) => b.col === c);
    colLeft.set(c, Math.min(...bs.map((b) => b.x0)));
    colRight.set(c, Math.max(...bs.map((b) => b.x1)));
  }
  const laneXs: number[] = [bx0 - m / 2];
  for (let i = 0; i < cols.length - 1; i++) {
    laneXs.push((colRight.get(cols[i])! + colLeft.get(cols[i + 1])!) / 2);
  }
  laneXs.push(bx1 + m / 2);

  const rows = [...new Set(blocks.map((b) => b.row))].sort((a, b) => a - b);
  const rowNear = new Map<number, number>();
  const rowFar = new Map<number, number>();
  for (const r of rows) {
    const bs = blocks.filter((b) => b.row === r);
    rowNear.set(r, Math.min(...bs.map((b) => b.z0)));
    rowFar.set(r, Math.max(...bs.map((b) => b.z1)));
  }
  const laneZs: number[] = [bz0 - m / 2];
  for (let i = 0; i < rows.length - 1; i++) {
    laneZs.push((rowFar.get(rows[i])! + rowNear.get(rows[i + 1])!) / 2);
  }
  laneZs.push(bz1 + m / 2);

  const roads: Road[] = [];
  for (const x of laneXs) {
    roads.push({ axis: "z", lane: x, from: bounds.z0, to: bounds.z1, width: m });
  }
  for (const z of laneZs) {
    roads.push({ axis: "x", lane: z, from: bounds.x0, to: bounds.x1, width: m });
  }

  const intersections: Intersection[] = [];
  laneXs.forEach((x, xi) => {
    laneZs.forEach((z, zi) => {
      const interior =
        xi > 0 &&
        xi < laneXs.length - 1 &&
        zi > 0 &&
        zi < laneZs.length - 1;
      intersections.push({ x, z, interior });
    });
  });

  return { roads, bounds, intersections };
}

// FNV-1a hash → deterministic uint32. Used only for a tiny per-building jitter
// so a fully packed block doesn't read as a mechanical pegboard.
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function artistJitter(id: string, scale: number): [number, number] {
  const h = fnv1a(id);
  const x = ((h & 0xffff) / 0xffff - 0.5) * 2 * scale;
  const z = (((h >>> 16) & 0xffff) / 0xffff - 0.5) * 2 * scale;
  return [x, z];
}

// Cell coordinates of a `cols × rows` block, ordered by distance from the block
// center. Assigning score-ranked artists to this order puts the biggest
// buildings in the middle of each neighborhood (a downtown core) and the
// smaller ones on the outskirts. Fully deterministic.
function cellsByCentrality(
  cols: number,
  rows: number,
): { c: number; r: number }[] {
  const ccx = (cols - 1) / 2;
  const ccz = (rows - 1) / 2;
  const cells: { c: number; r: number; d: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dx = c - ccx;
      const dz = r - ccz;
      cells.push({ c, r, d: dx * dx + dz * dz });
    }
  }
  cells.sort((a, b) => a.d - b.d || a.c - b.c || a.r - b.r);
  return cells.map(({ c, r }) => ({ c, r }));
}

/**
 * Lay the city out as a Barcelona Eixample-style block grid.
 *
 * Every occupied district becomes one rectangular block. Block size scales
 * with how many artists live there (more listening → bigger neighborhood),
 * so each block is a near-square grid of `BUILDING_PITCH`-spaced cells.
 * Blocks are arranged in a `DISTRICT_COLS`-wide grid sorted by the bucket's
 * `sort_order`; the fixed `ROAD_WIDTH` gaps between blocks are the streets.
 *
 * Within a block the highest-scoring artist takes the most central cell and
 * lower-ranked artists spiral outward, giving each district a "downtown".
 *
 * Fully deterministic: same artists + buckets → same city.
 */
export function buildCity(
  artists: ArtistRow[],
  buckets: BucketRow[],
): CityLayout {
  if (artists.length === 0) return { placed: [], blocks: [], parks: [] };

  const bucketMap = new Map(buckets.map((b) => [b.slug, b]));

  // Group artists by district. The API returns them score-desc, so each
  // group's insertion order is already rank order (index 0 = best).
  const groups = new Map<string, ArtistRow[]>();
  for (const a of artists) {
    const key = a.primary_genre_bucket ?? "other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }

  // Occupied districts, ordered by the bucket's sort_order (stable city map).
  const districts = [...groups.keys()].sort((s1, s2) => {
    const o1 = bucketMap.get(s1)?.sort_order ?? 999;
    const o2 = bucketMap.get(s2)?.sort_order ?? 999;
    return o1 - o2 || s1.localeCompare(s2);
  });

  // Per-district block dimensions (in cells), near-square.
  const dims = districts.map((slug) => {
    const n = groups.get(slug)!.length;
    const cols = Math.max(1, Math.round(Math.sqrt(n)));
    const rows = Math.max(1, Math.ceil(n / cols));
    return { slug, cols, rows, w: cols * BUILDING_PITCH, h: rows * BUILDING_PITCH };
  });

  // Slot each district into the grid. A column's width is the widest block in
  // it; a row's height is the tallest block in it — this keeps every road
  // perfectly straight (true Eixample grid) even though the blocks themselves
  // differ in size. Clamp columns to the district count so a sparse city
  // (few genres) doesn't leave phantom empty lots throwing off centering.
  const gridCols = Math.min(DISTRICT_COLS, districts.length);
  const nGridRows = Math.ceil(districts.length / gridCols);
  const colW = new Array(gridCols).fill(0);
  const rowH = new Array(nGridRows).fill(0);
  dims.forEach((d, i) => {
    const col = i % gridCols;
    const row = Math.floor(i / gridCols);
    colW[col] = Math.max(colW[col], d.w);
    rowH[row] = Math.max(rowH[row], d.h);
  });

  const colX = new Array(gridCols).fill(0);
  for (let c = 1; c < gridCols; c++) {
    colX[c] = colX[c - 1] + colW[c - 1] + ROAD_WIDTH;
  }
  const rowZ = new Array(nGridRows).fill(0);
  for (let r = 1; r < nGridRows; r++) {
    rowZ[r] = rowZ[r - 1] + rowH[r - 1] + ROAD_WIDTH;
  }

  // Total city span → shift so the whole thing is centered on the origin.
  const totalW = colX[gridCols - 1] + colW[gridCols - 1];
  const totalH = rowZ[nGridRows - 1] + rowH[nGridRows - 1];
  const shiftX = -totalW / 2;
  const shiftZ = -totalH / 2;

  const placed: PlacedArtist[] = [];
  const blocks: DistrictBlock[] = [];

  const occupiedCells = new Set<string>();
  dims.forEach((_, i) => {
    occupiedCells.add(`${i % gridCols},${Math.floor(i / gridCols)}`);
  });

  dims.forEach((d, i) => {
    const col = i % gridCols;
    const row = Math.floor(i / gridCols);
    const bucket = bucketMap.get(d.slug);
    const group = groups.get(d.slug)!;

    // Center the block inside its (possibly larger) grid slot.
    const slotX = colX[col];
    const slotZ = rowZ[row];
    const blockX = slotX + (colW[col] - d.w) / 2 + shiftX;
    const blockZ = slotZ + (rowH[row] - d.h) / 2 + shiftZ;

    const cells = cellsByCentrality(d.cols, d.rows);
    for (let rank = 0; rank < group.length; rank++) {
      const a = group[rank];
      const cell = cells[rank];
      const [jx, jz] = artistJitter(a.spotify_id, 0.4);
      const x = blockX + (cell.c + 0.5) * BUILDING_PITCH + jx;
      const z = blockZ + (cell.r + 0.5) * BUILDING_PITCH + jz;
      placed.push({ ...a, position: [x, 0, z] });
    }

    blocks.push({
      slug: d.slug,
      label: bucket?.label ?? d.slug,
      count: group.length,
      col,
      row,
      palette: bucket?.color_palette ?? ["#D4D4D8", "#71717A", "#27272A"],
      x0: blockX,
      z0: blockZ,
      x1: blockX + d.w,
      z1: blockZ + d.h,
      cx: blockX + d.w / 2,
      cz: blockZ + d.h / 2,
    });
  });

  // Any grid slot without a district becomes a park (fills the blank lots
  // that would otherwise sit between the roads).
  const parks: ParkCell[] = [];
  for (let row = 0; row < nGridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      if (occupiedCells.has(`${col},${row}`)) continue;
      const inset = 2;
      const x0 = colX[col] + shiftX + inset;
      const z0 = rowZ[row] + shiftZ + inset;
      const x1 = colX[col] + colW[col] + shiftX - inset;
      const z1 = rowZ[row] + rowH[row] + shiftZ - inset;
      parks.push({
        x0,
        z0,
        x1,
        z1,
        cx: (x0 + x1) / 2,
        cz: (z0 + z1) / 2,
      });
    }
  }

  return { placed, blocks, parks };
}
