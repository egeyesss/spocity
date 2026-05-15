import { DISTRICT_COLS, DISTRICT_CELL, SPIRAL_BASE } from "./constants";
import type { ArtistRow, BucketRow, PlacedArtist } from "./types";

// Golden angle in radians (137.508°) — drives the phyllotaxis spiral so no
// two buildings align radially, giving an even, organic distribution.
const GOLDEN_ANGLE = 2.39996323;

// FNV-1a hash of a string → deterministic uint32.
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// Small deterministic XZ jitter from the artist's spotify_id so buildings
// don't form a perfect mechanical spiral.
function artistJitter(id: string, scale: number): [number, number] {
  const h = fnv1a(id);
  const x = ((h & 0xffff) / 0xffff - 0.5) * 2 * scale;
  const z = (((h >>> 16) & 0xffff) / 0xffff - 0.5) * 2 * scale;
  return [x, z];
}

/**
 * Compute the world-space [cx, cz] center for each bucket slug, arranged
 * in a DISTRICT_COLS-wide grid sorted by bucket sort_order.
 *
 * Exported so CityScene can position district labels at the same anchors.
 */
export function bucketCenters(
  buckets: BucketRow[]
): Map<string, [number, number]> {
  const sorted = [...buckets].sort((a, b) => a.sort_order - b.sort_order);
  const nRows = Math.ceil(sorted.length / DISTRICT_COLS);
  const centers = new Map<string, [number, number]>();
  for (let i = 0; i < sorted.length; i++) {
    const col = i % DISTRICT_COLS;
    const row = Math.floor(i / DISTRICT_COLS);
    const cx = (col - (DISTRICT_COLS - 1) / 2) * DISTRICT_CELL;
    const cz = (row - (nRows - 1) / 2) * DISTRICT_CELL;
    centers.set(sorted[i].slug, [cx, cz]);
  }
  return centers;
}

/**
 * Place each artist in its genre district using a phyllotaxis (golden-angle)
 * spiral. The highest-scoring artist in each district sits at the center;
 * lower-scoring artists spiral outward.
 *
 * Positions are fully deterministic: same artists + same buckets → same layout.
 * A small FNV-1a jitter on the spotify_id breaks the mechanical spiral regularity
 * while staying reproducible across page loads.
 */
export function districtLayout(
  artists: ArtistRow[],
  buckets: BucketRow[]
): PlacedArtist[] {
  if (artists.length === 0) return [];

  const centers = bucketCenters(buckets);

  // Group artists by bucket. The API returns artists sorted by score desc so
  // each group's insertion order is already score-descending (rank 0 = best).
  const groups = new Map<string, ArtistRow[]>();
  for (const a of artists) {
    const key = a.primary_genre_bucket ?? "other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }

  const placed: PlacedArtist[] = [];
  for (const [slug, group] of groups) {
    // Fall back to [0, 0] if the bucket has no entry (shouldn't happen in v1).
    const [cx, cz] = centers.get(slug) ?? [0, 0];

    for (let rank = 0; rank < group.length; rank++) {
      const a = group[rank];
      let x: number;
      let z: number;

      if (rank === 0) {
        // Top artist in the district sits at the exact center anchor.
        x = cx;
        z = cz;
      } else {
        const r = SPIRAL_BASE * Math.sqrt(rank);
        const theta = rank * GOLDEN_ANGLE;
        const [jx, jz] = artistJitter(a.spotify_id, 0.35);
        x = cx + r * Math.cos(theta) + jx;
        z = cz + r * Math.sin(theta) + jz;
      }

      placed.push({ ...a, position: [x, 0, z] });
    }
  }

  return placed;
}
